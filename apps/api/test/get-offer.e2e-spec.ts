import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, offerAdminSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Offer, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão dos demais e2e de Catalog.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat017-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/products/:productId/offers/:id` (e2e,
 * CAT-017). Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/products/:productId/offers/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Cat017 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat017-site-a',
        name: 'Cat017 Site A',
        domain: 'cat017-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat017-site-b',
        name: 'Cat017 Site B',
        domain: 'cat017-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Fone Bluetooth', slug: 'fone-bluetooth' },
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e
    // de Catalog.
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat017-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat017-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat017-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat017-' } } });
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

  function detailUrl(site: Site, productId: string, id: string): string {
    return `/admin/sites/${site.slug}/products/${productId}/offers/${id}`;
  }

  async function createOffer(
    site: Site,
    product: Product,
    options: {
      price?: string;
      marketplace?: Marketplace;
      archived?: boolean;
      affiliateUrl?: string;
    } = {},
  ): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: options.marketplace ?? Marketplace.MERCADO_LIVRE,
        price: options.price ?? '100.00',
        affiliateUrl: options.affiliateUrl ?? 'https://mercadolivre.com.br/produto/exemplo',
        archivedAt: options.archived ? new Date() : null,
      },
    });
  }

  it('sucesso: 200, corpo válido contra offerAdminSchema, price com duas casas decimais', async () => {
    await setRole(siteA, Role.VIEWER);
    const offer = await createOffer(siteA, productA, { price: '199.90' });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offer.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(offerAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(offer.id);
    expect(response.body.price).toBe('199.90');
  });

  it('Oferta arquivada continua detalhável: 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const offer = await createOffer(siteA, productA, { archived: true });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offer.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).not.toBeNull();
  });

  it('id inexistente: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, '00000000-0000-0000-0000-000000000000'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Oferta de outro Site: 404', async () => {
    await setRole(siteA, Role.VIEWER);
    const productFromSiteB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
    });
    const offerFromSiteB = await createOffer(siteB, productFromSiteB);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offerFromSiteB.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
  });

  it('id de Oferta existente, mas de outro Produto do mesmo Site: 404, Oferta permanece intacta', async () => {
    await setRole(siteA, Role.VIEWER);
    const otherProduct = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Outro Produto', slug: 'outro-produto' },
    });
    const offerFromOtherProduct = await createOffer(siteA, otherProduct, { price: '77.00' });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offerFromOtherProduct.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.findUniqueOrThrow({
      where: { id: offerFromOtherProduct.id },
    });
    expect(persisted.productId).toBe(otherProduct.id);
    expect(persisted.price.toString()).toBe('77');
  });

  it('productId com UUID inválido: 422', async () => {
    await setRole(siteA, Role.VIEWER);
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, 'nao-e-um-uuid', offer.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('id com UUID inválido: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('sem cookie: 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer()).get(
      detailUrl(siteA, productA.id, offer.id),
    );

    expect(response.status).toBe(401);
  });

  it('autenticado sem membership no Site: 403', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offer.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(403);
  });

  it('VIEWER com membership: 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productA.id, offer.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });
});
