import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, productDetailAdminSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão dos demais e2e de Catalog.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat010-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/products/:id` (e2e, CAT-010). Exige Postgres
 * real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/products/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
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
        name: 'Cat010 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat010-site-a',
        name: 'Cat010 Site A',
        domain: 'cat010-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat010-site-b',
        name: 'Cat010 Site B',
        domain: 'cat010-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e
    // de Catalog.
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat010-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat010-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat010-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat010-' } } });
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

  async function createProduct(
    site: Site,
    name: string,
    slug: string,
    archived = false,
  ): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, name, slug, archivedAt: archived ? new Date() : null },
    });
  }

  async function createOffer(
    site: Site,
    product: Product,
    options: {
      price: string;
      marketplace?: Marketplace;
      currency?: string;
      inStock?: boolean;
      archived?: boolean;
    },
  ) {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: options.marketplace ?? Marketplace.MERCADO_LIVRE,
        price: options.price,
        currency: options.currency ?? 'BRL',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
        inStock: options.inStock ?? true,
        archivedAt: options.archived ? new Date() : null,
      },
    });
  }

  function detailUrl(site: Site, productId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}`;
  }

  it('sucesso sem ofertas: 200, offers: [], corpo válido contra productDetailAdminSchema', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Fone Bluetooth', 'fone-bluetooth');

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(productDetailAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(product.id);
    expect(response.body.offers).toEqual([]);
  });

  it('sucesso com ofertas: price como string, corpo válido contra productDetailAdminSchema', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som');
    await createOffer(siteA, product, { price: '199.90' });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(productDetailAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.offers).toHaveLength(1);
    expect(typeof response.body.offers[0].price).toBe('string');
    // `toProductDetailAdmin` serializa `price` via `Decimal.toFixed(2)`
    // (não `.toString()`) — sempre duas casas decimais, resposta
    // previsível, então a comparação volta a ser igualdade exata de
    // string (decisão revisada na CAT-015).
    expect(response.body.offers[0].price).toBe('199.90');
  });

  it('resumo da oferta não expõe campos extras (só id, marketplace, price, currency, inStock, archivedAt)', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Teclado', 'teclado');
    await createOffer(siteA, product, { price: '150.00' });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.offers[0]).sort()).toEqual(
      ['archivedAt', 'currency', 'id', 'inStock', 'marketplace', 'price'].sort(),
    );
  });

  it('produto arquivado: 200 (arquivamento não é filtro de visibilidade no detalhe)', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Arquivado', 'arquivado', true);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).not.toBeNull();
  });

  it('oferta arquivada aparece no resumo (sem filtro)', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Mouse', 'mouse');
    const archivedOffer = await createOffer(siteA, product, {
      price: '80.00',
      archived: true,
    });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.offers).toHaveLength(1);
    expect(response.body.offers[0].id).toBe(archivedOffer.id);
    expect(response.body.offers[0].archivedAt).not.toBeNull();
  });

  it('ordenação determinística das ofertas (createdAt asc, id asc)', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Monitor', 'monitor');
    const first = await createOffer(siteA, product, {
      price: '900.00',
      marketplace: Marketplace.AMAZON_BR,
    });
    const second = await createOffer(siteA, product, {
      price: '950.00',
      marketplace: Marketplace.MERCADO_LIVRE,
    });

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.offers.map((offer: { id: string }) => offer.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, '00000000-0000-0000-0000-000000000000'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Produto real de outro Site: 404 (isolamento), corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);
    const productFromSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, productFromSiteB.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('VIEWER consegue detalhar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Cabo HDMI', 'cabo-hdmi');

    const response = await request(app!.getHttpServer())
      .get(detailUrl(siteA, product.id))
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Carregador', 'carregador');

    const response = await request(app!.getHttpServer()).get(detailUrl(siteA, product.id));

    expect(response.status).toBe(401);
  });
});
