import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, offerAdminSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Marketplace, Role } from '../src/generated/prisma/enums';
import type { Offer, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev013-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/products/:productId/offers/:id/archive` e
 * `POST .../unarchive` (e2e, REV-013). Exige Postgres real (mesmo
 * requisito dos demais e2e do projeto).
 *
 * Nome do arquivo deliberadamente distinto de
 * `archive-unarchive-offer.e2e-spec.ts` (que continua testando
 * `ArchiveOfferUseCase`/`UnarchiveOfferUseCase`, CAT-019/CAT-020,
 * isoladamente, sem HTTP) — este arquivo testa o orquestrador HTTP-facing
 * `OfferArchiveAndRevalidateUseCase`/`OfferArchiveController` via
 * `ApplicationModule`, com `RevalidationPort` sobrescrita por um fake,
 * mesmo padrão de `archive-unarchive-product-revalidation.e2e-spec.ts`.
 */
describe('POST /admin/sites/:siteSlug/products/:productId/offers/:id/(un)archive (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;
  let revalidationPort: jest.Mocked<RevalidationPort>;

  beforeEach(async () => {
    revalidationPort = { revalidate: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    })
      .overrideProvider(REVALIDATION_PORT)
      .useValue(revalidationPort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Rev013 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev013-site-a',
        name: 'Rev013 Site A',
        domain: 'rev013-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev013-site-b',
        name: 'Rev013 Site B',
        domain: 'rev013-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    // `user` pode nunca ter sido atribuído se o `beforeEach` falhar antes
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e.
    await prisma.articleProduct.deleteMany({
      where: { product: { site: { slug: { startsWith: 'rev013-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev013-' } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'rev013-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'rev013-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev013-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev013-' } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role): Promise<void> {
    await prisma.siteUser.deleteMany({ where: { userId: user!.id, siteId: site.id } });
    await prisma.siteUser.create({
      data: { userId: user!.id, siteId: site.id, role, active: true },
    });
  }

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  function archiveUrl(site: Site, productId: string, offerId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}/offers/${offerId}/archive`;
  }

  function unarchiveUrl(site: Site, productId: string, offerId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}/offers/${offerId}/unarchive`;
  }

  async function createProduct(site: Site, name: string, slug: string): Promise<Product> {
    return prisma.product.create({ data: { siteId: site.id, name, slug } });
  }

  async function createOffer(site: Site, product: Product, archived = false): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '100.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
        archivedAt: archived ? new Date() : null,
      },
    });
  }

  async function linkPublishedArticle(site: Site, product: Product, slug: string) {
    const article = await prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id },
    });
    return article;
  }

  it('OWNER arquiva Oferta ativa sem Artigo afetado: 200, persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Fone Bluetooth', 'fone-bluetooth');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);
    expect(offerAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.archivedAt).not.toBeNull();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt).not.toBeNull();

    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('OWNER arquiva Oferta cujo Produto é referenciado por Artigo PUBLISHED via ArticleProduct: 200, revalidate chamado com siteSlug/articleSlug corretos', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Cafeteira', 'cafeteira');
    const offer = await createOffer(siteA, product);
    const article = await linkPublishedArticle(siteA, product, 'melhores-cafeteiras');

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).not.toBeNull();

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('OWNER arquiva Oferta já arquivada (idempotente): 200, archivedAt inalterado, e com Artigo PUBLISHED vinculado a revalidação ainda é chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Torradeira', 'torradeira');
    const offer = await createOffer(siteA, product, true);
    const archivedAtBefore = offer.archivedAt;
    const article = await linkPublishedArticle(siteA, product, 'melhores-torradeiras');

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt?.toISOString()).toBe(archivedAtBefore!.toISOString());

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('OWNER desarquiva Oferta arquivada: 200, archivedAt: null', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Aspirador', 'aspirador');
    const offer = await createOffer(siteA, product, true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).toBeNull();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt).toBeNull();
  });

  it('OWNER desarquiva Oferta já ativa (idempotente): 200, e com Artigo PUBLISHED vinculado a revalidação ainda é chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Ventilador', 'ventilador');
    const offer = await createOffer(siteA, product);
    const article = await linkPublishedArticle(siteA, product, 'melhores-ventiladores');

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).toBeNull();

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('archive: id inexistente no próprio Site/Produto: 404, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Air Fryer', 'air-fryer');

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('archive: id de Oferta real de outro Site: 404 (isolamento), Oferta original inalterada, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const productSiteA = await createProduct(siteA, 'Notebook', 'notebook');
    const productSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');
    const offerFromSiteB = await createOffer(siteB, productSiteB);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, productSiteA.id, offerFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.offer.findUnique({ where: { id: offerFromSiteB.id } });
    expect(persisted?.archivedAt).toBeNull();
  });

  it('archive: id de Oferta real do mesmo Site mas de outro Produto: 404, Oferta original inalterada, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const realProduct = await createProduct(siteA, 'Smartwatch', 'smartwatch');
    const otherProduct = await createProduct(siteA, 'Tablet', 'tablet');
    const offer = await createOffer(siteA, realProduct);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, otherProduct.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt).toBeNull();
    expect(persisted?.productId).toBe(realProduct.id);
  });

  it('unarchive: id de Oferta real do mesmo Site mas de outro Produto: 404, Oferta original inalterada, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const realProduct = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som');
    const otherProduct = await createProduct(siteA, 'Monitor', 'monitor');
    const offer = await createOffer(siteA, realProduct, true);
    const archivedAtBefore = offer.archivedAt;

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, otherProduct.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt?.toISOString()).toBe(archivedAtBefore!.toISOString());
    expect(persisted?.productId).toBe(realProduct.id);
  });

  it('falha de revalidação não desfaz o arquivamento já persistido (200, sem propagar erro)', async () => {
    await setRole(siteA, Role.OWNER);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const product = await createProduct(siteA, 'Micro-ondas', 'micro-ondas');
    const offer = await createOffer(siteA, product);
    await linkPublishedArticle(siteA, product, 'melhores-micro-ondas');

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).not.toBeNull();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt).not.toBeNull();
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('Role insuficiente (EDITOR): 403, nada persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som-2');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(403);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.archivedAt).toBeNull();
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Smartwatch', 'smartwatch-2');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send();

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'Fone de Ouvido', 'fone-de-ouvido');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, product.id, offer.id))
      .set('Origin', ADMIN_ORIGIN)
      .send();

    expect(response.status).toBe(401);
  });
});
