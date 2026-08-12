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
const USER_EMAIL = 'rev012-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/products/:productId/offers/:id` (e2e).
 * Exige Postgres real (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (atualizar + tentar coordenar revalidação via REV-005 +
 * nunca desfazer a atualização por falha de revalidação) e a invariante de
 * identidade da rota aninhada (`id + siteId + productId` precisam
 * corresponder simultaneamente), não a chamada HTTP real de
 * `HttpRevalidationAdapter` (já coberta em `http-revalidation.adapter.spec.ts`).
 */
describe('PATCH /admin/sites/:siteSlug/products/:productId/offers/:id (e2e)', () => {
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
        name: 'Rev012 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev012-site-a',
        name: 'Rev012 Site A',
        domain: 'rev012-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev012-site-b',
        name: 'Rev012 Site B',
        domain: 'rev012-site-b.test.com',
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
      where: { product: { site: { slug: { startsWith: 'rev012-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev012-' } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'rev012-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'rev012-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev012-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev012-' } } });
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

  function patchUrl(site: Site, productId: string, offerId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}/offers/${offerId}`;
  }

  async function createProduct(site: Site, name: string, slug: string): Promise<Product> {
    return prisma.product.create({ data: { siteId: site.id, name, slug } });
  }

  async function createOffer(
    site: Site,
    product: Product,
    overrides: Partial<{
      marketplace: Marketplace;
      price: string;
      affiliateUrl: string;
      inStock: boolean;
      archived: boolean;
    }> = {},
  ): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: overrides.marketplace ?? Marketplace.AMAZON_BR,
        price: overrides.price ?? '99.90',
        affiliateUrl: overrides.affiliateUrl ?? 'https://example.com/original',
        inStock: overrides.inStock ?? true,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  it('EDITOR atualiza Oferta sem Artigo afetado: 200, persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Fone Bluetooth', 'fone-bluetooth');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ price: '149.90', inStock: false });

    expect(response.status).toBe(200);
    expect(offerAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.price).toBe('149.90');
    expect(response.body.inStock).toBe(false);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.price.toFixed(2)).toBe('149.90');
    expect(persisted?.inStock).toBe(false);

    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Artigo PUBLISHED referencia o Produto dono da Oferta via ArticleProduct: PATCH persiste, revalidate recebe siteSlug/articleSlug corretos', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Cafeteira', 'cafeteira');
    const offer = await createOffer(siteA, product);
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Melhores cafeteiras 2026',
        slug: 'melhores-cafeteiras-2026',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ price: '129.90' });

    expect(response.status).toBe(200);
    expect(response.body.price).toBe('129.90');

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('PATCH parcial: só o campo enviado muda, os demais permanecem', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Liquidificador', 'liquidificador');
    const offer = await createOffer(siteA, product, {
      marketplace: Marketplace.MERCADO_LIVRE,
      affiliateUrl: 'https://example.com/liquidificador',
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(200);
    expect(response.body.inStock).toBe(false);
    expect(response.body.marketplace).toBe('MERCADO_LIVRE');
    expect(response.body.affiliateUrl).toBe('https://example.com/liquidificador');

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.marketplace).toBe('MERCADO_LIVRE');
    expect(persisted?.affiliateUrl).toBe('https://example.com/liquidificador');
  });

  it('PATCH vazio ({}): 200, Oferta devolvida sem nenhuma alteração', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Mouse Gamer', 'mouse-gamer');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.price).toBe('99.90');
    expect(response.body.inStock).toBe(true);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.price.toFixed(2)).toBe('99.90');
  });

  it('id inexistente no próprio Site/Produto: 404, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Air Fryer', 'air-fryer');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('id de Oferta real de outro Site: 404 (isolamento), Oferta original inalterada', async () => {
    await setRole(siteA, Role.EDITOR);
    const productSiteA = await createProduct(siteA, 'Ventilador', 'ventilador');
    const productSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');
    const offerFromSiteB = await createOffer(siteB, productSiteB);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, productSiteA.id, offerFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.offer.findUnique({ where: { id: offerFromSiteB.id } });
    expect(persisted?.inStock).toBe(true);
  });

  it('id de Oferta real do mesmo Site mas de outro Produto: 404, Oferta original inalterada', async () => {
    await setRole(siteA, Role.EDITOR);
    const realProduct = await createProduct(siteA, 'Notebook', 'notebook');
    const otherProduct = await createProduct(siteA, 'Tablet', 'tablet');
    const offer = await createOffer(siteA, realProduct, { price: '2999.00' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, otherProduct.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ price: '1.00' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.price.toFixed(2)).toBe('2999.00');
    expect(persisted?.productId).toBe(realProduct.id);
  });

  it('Oferta arquivada continua editável: 200, campo atualizado, archivedAt preservado (comparado explicitamente antes/depois)', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Torradeira', 'torradeira');
    const offer = await createOffer(siteA, product, { archived: true });
    const archivedAtBefore = offer.archivedAt;
    expect(archivedAtBefore).not.toBeNull();

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(200);
    expect(response.body.inStock).toBe(false);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.inStock).toBe(false);
    expect(persisted?.archivedAt?.toISOString()).toBe(archivedAtBefore!.toISOString());
  });

  it('falha de revalidação não desfaz a atualização (200, persistido, sem propagar erro)', async () => {
    await setRole(siteA, Role.EDITOR);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const product = await createProduct(siteA, 'Micro-ondas', 'micro-ondas');
    const offer = await createOffer(siteA, product);
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Melhores micro-ondas',
        slug: 'melhores-micro-ondas',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(200);
    expect(response.body.inStock).toBe(false);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.inStock).toBe(false);
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('Role insuficiente (VIEWER): 403, nada persistido', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(403);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted?.inStock).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Smartwatch', 'smartwatch');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ inStock: false });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Fone de Ouvido', 'fone-de-ouvido');
    const offer = await createOffer(siteA, product);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id, offer.id))
      .set('Origin', ADMIN_ORIGIN)
      .send({ inStock: false });

    expect(response.status).toBe(401);
  });
});
