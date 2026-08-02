import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { offerAdminSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e de Catalog.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat015-user@test.com';

/**
 * `POST /admin/sites/:siteSlug/products/:productId/offers` (e2e,
 * CAT-015). Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('POST /admin/sites/:siteSlug/products/:productId/offers (e2e)', () => {
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
        name: 'Cat015 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat015-site-a',
        name: 'Cat015 Site A',
        domain: 'cat015-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat015-site-b',
        name: 'Cat015 Site B',
        domain: 'cat015-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'cat015-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat015-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat015-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat015-' } } });
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

  it('EDITOR cria Oferta com todos os campos: 201, corpo válido contra offerAdminSchema', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.AMAZON_BR,
        price: '199.90',
        currency: 'USD',
        affiliateUrl: 'https://amazon.com.br/produto/exemplo',
        inStock: false,
      });

    expect(response.status).toBe(201);
    expect(offerAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.productId).toBe(productA.id);
    expect(response.body.marketplace).toBe(Marketplace.AMAZON_BR);
    expect(response.body.price).toBe('199.90');
    expect(response.body.currency).toBe('USD');
    expect(response.body.inStock).toBe(false);
    expect(response.body.archivedAt).toBeNull();
  });

  it('EDITOR cria Oferta só com campos obrigatórios: defaults currency "BRL" e inStock true, confirmados também no banco', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '99.90',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(201);
    expect(response.body.currency).toBe('BRL');
    expect(response.body.inStock).toBe(true);

    const persisted = await prisma.offer.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(persisted.currency).toBe('BRL');
    expect(persisted.inStock).toBe(true);
  });

  it('duas Ofertas do mesmo marketplace no mesmo Produto: ambas 201 (sem conflito)', async () => {
    await setRole(siteA, Role.EDITOR);

    const first = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '100.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/oferta-1',
      });
    expect(first.status).toBe(201);

    const second = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '105.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/oferta-2',
      });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const persisted = await prisma.offer.findMany({ where: { productId: productA.id } });
    expect(persisted).toHaveLength(2);
  });

  it('productId com UUID inválido: 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(422);
  });

  it('productId inexistente: 404, nenhuma Oferta persistida', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, '00000000-0000-0000-0000-000000000000'))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.count({ where: { siteId: siteA.id } });
    expect(persisted).toBe(0);
  });

  it('productId de Produto real de outro Site: 404, nenhuma Oferta persistida', async () => {
    await setRole(siteA, Role.EDITOR);
    const productFromSiteB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
    });

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.count({ where: { productId: productFromSiteB.id } });
    expect(persisted).toBe(0);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(401);
  });

  it('price malformado: 422, nada persistido', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '0',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(422);

    const persisted = await prisma.offer.count({ where: { productId: productA.id } });
    expect(persisted).toBe(0);
  });

  it('affiliateUrl malformada: 422, nada persistido', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '50.00',
        affiliateUrl: 'ftp://mercadolivre.com.br/produto/exemplo',
      });

    expect(response.status).toBe(422);

    const persisted = await prisma.offer.count({ where: { productId: productA.id } });
    expect(persisted).toBe(0);
  });

  it('payload inválido (sem marketplace/price/affiliateUrl): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(offersUrl(siteA, productA.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(422);
  });
});
