import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { listOffersResponseSchema } from '@commerce-platform/contracts';
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
const USER_EMAIL = 'cat016-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/products/:productId/offers` (e2e, CAT-016).
 * Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/products/:productId/offers (e2e)', () => {
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
        name: 'Cat016 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat016-site-a',
        name: 'Cat016 Site A',
        domain: 'cat016-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat016-site-b',
        name: 'Cat016 Site B',
        domain: 'cat016-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'cat016-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat016-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat016-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat016-' } } });
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

  function offersUrl(site: Site, productId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}/offers`;
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

  it('lista vazia: 200, items: [], total: 0, totalPages: 0', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listOffersResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('lista com ofertas: 200, corpo válido contra listOffersResponseSchema, price com duas casas, ordenação createdAt asc/id asc', async () => {
    await setRole(siteA, Role.VIEWER);
    const first = await createOffer(siteA, productA, { price: '199.90' });
    const second = await createOffer(siteA, productA, { price: '250' });

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listOffersResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(response.body.items[0].price).toBe('199.90');
    expect(response.body.items[1].price).toBe('250.00');
  });

  it('ofertas arquivadas aparecem na listagem (sem filtro para excluí-las)', async () => {
    await setRole(siteA, Role.VIEWER);
    const active = await createOffer(siteA, productA, { price: '10.00' });
    const archived = await createOffer(siteA, productA, { price: '20.00', archived: true });

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([active.id, archived.id]));
    const archivedItem = response.body.items.find(
      (item: { id: string }) => item.id === archived.id,
    );
    expect(archivedItem.archivedAt).not.toBeNull();
  });

  it('paginação: pageSize=1 devolve 1 item, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await setRole(siteA, Role.VIEWER);
    await createOffer(siteA, productA, { price: '10.00' });
    await createOffer(siteA, productA, { price: '20.00' });

    const firstPage = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', cookieHeader());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.total).toBe(2);
    expect(firstPage.body.totalPages).toBe(2);

    const beyondLastPage = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .query({ page: 3, pageSize: 1 })
      .set('Cookie', cookieHeader());

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(2);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('Produto sem nenhuma Oferta: 200, total: 0', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });

  it('isolamento: ofertas de outro Produto não aparecem', async () => {
    await setRole(siteA, Role.VIEWER);
    const otherProduct = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Outro Produto', slug: 'outro-produto' },
    });
    await createOffer(siteA, productA, { price: '10.00' });
    await createOffer(siteA, otherProduct, { price: '20.00' });

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
  });

  it('productId com UUID inválido: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('productId inexistente: 404', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, '00000000-0000-0000-0000-000000000000'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
  });

  it('productId de Produto real de outro Site: 404', async () => {
    await setRole(siteA, Role.VIEWER);
    const productFromSiteB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
    });

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productFromSiteB.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
  });

  it('sem cookie: 401', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer()).get(offersUrl(siteA, productA.id));

    expect(response.status).toBe(401);
  });

  it('autenticado sem membership no Site: 403', async () => {
    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(403);
  });

  it('VIEWER com membership: 200', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('page=0: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .query({ page: 0 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(offersUrl(siteA, productA.id))
      .query({ pageSize: 101 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
