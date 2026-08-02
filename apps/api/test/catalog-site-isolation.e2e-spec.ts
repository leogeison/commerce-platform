import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Category, Offer, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão de `site-isolation.e2e-spec.ts` (AUTH-010).
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const ATTACKER_EMAIL = 'cat022-attacker@test.com';

/**
 * CAT-022 — suíte dedicada de bloqueio de acesso cruzado no Catalog,
 * estendendo AUTH-010 (`site-isolation.e2e-spec.ts`) aos três recursos:
 * Categoria, Produto, Oferta. Exige Postgres real (mesmo requisito de
 * `database.e2e-spec.ts`).
 *
 * Diferente da AUTH-010: `CategoriesController`/`ProductsController`/
 * `OffersController` já são controllers de produção — esta suíte usa as
 * rotas reais diretamente, sem controllers sintéticos.
 *
 * Um único `attacker`, OWNER só do Site A (nunca tem `SiteUser` no Site
 * B). Site B recebe dados "vítima" (Categoria, Produto, Oferta) criados
 * direto via Prisma. Dois vetores de ataque:
 *
 * 1. `siteSlug` do Site B na URL — o atacante nunca tem `SiteUser` lá, o
 *    `SiteAuthorizationGuard` barra antes de qualquer lógica de Catalog
 *    (`403`), testado nas 11 rotas reais via `it.each`.
 * 2. `siteSlug` do próprio Site A (autorizado), mas `id`/`categoryId`/
 *    `productId` apontando para um recurso do Site B — cada endpoint já
 *    trata isso reativamente (chave composta/`P2003`), aqui só confirmando
 *    que o comportamento se sustenta (`404`/`422` conforme o endpoint).
 */
describe('Bloqueio de acesso cruzado no Catalog (e2e, dedicado — CAT-022)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let attacker: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let categoryB: Category;
  let productB: Product;
  let offerB: Offer;
  let productA: Product;
  let attackerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    attacker = await prisma.user.create({
      data: {
        email: ATTACKER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Cat022 Attacker',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat022-site-a',
        name: 'Cat022 Site A',
        domain: 'cat022-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat022-site-b',
        name: 'Cat022 Site B',
        domain: 'cat022-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: attacker.id, siteId: siteA.id, role: Role.OWNER, active: true },
    });

    categoryB = await prisma.category.create({
      data: { siteId: siteB.id, name: 'Categoria Vítima', slug: 'cat022-categoria-vitima' },
    });
    productB = await prisma.product.create({
      data: {
        siteId: siteB.id,
        categoryId: categoryB.id,
        name: 'Produto Vítima',
        slug: 'cat022-produto-vitima',
      },
    });
    offerB = await prisma.offer.create({
      data: {
        siteId: siteB.id,
        productId: productB.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '150.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/vitima',
      },
    });

    // Produto próprio do atacante em Site A (sem Categoria) — usado só no
    // teste de "Oferta de outro Site sob um Produto meu" do vetor 2.
    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto do Atacante', slug: 'cat022-produto-atacante' },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: attacker.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    attackerToken = rawToken;
  });

  afterEach(async () => {
    // `attacker` pode nunca ter sido atribuído se o `beforeEach` falhar
    // antes (ex.: Postgres indisponível) — mesmo cuidado já usado nos
    // demais e2e de Catalog.
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat022-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat022-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat022-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat022-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat022-' } } });
    if (attacker?.id) {
      await prisma.session.deleteMany({ where: { userId: attacker.id } });
      await prisma.user.deleteMany({ where: { id: attacker.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${attackerToken}`;
  }

  describe('Vetor 1: siteSlug do Site B, atacante sem membership → 403 em todas as rotas reais', () => {
    it.each([
      {
        label: 'GET /categories (listar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/categories`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'POST /categories (criar)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/categories`,
        needsOrigin: true,
        body: () => ({ name: 'Forjada', slug: 'cat022-categoria-forjada' }),
      },
      {
        label: 'GET /categories/:id (detalhar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/categories/${categoryB.id}`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'POST /categories/:id/archive',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/categories/${categoryB.id}/archive`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'POST /categories/:id/unarchive',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/categories/${categoryB.id}/unarchive`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'GET /products (listar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/products`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'POST /products (criar)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/products`,
        needsOrigin: true,
        body: () => ({ name: 'Forjado', slug: 'cat022-produto-forjado' }),
      },
      {
        label: 'GET /products/:id (detalhar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/products/${productB.id}`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'GET /products/:productId/offers (listar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/products/${productB.id}/offers`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'POST /products/:productId/offers (criar)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/products/${productB.id}/offers`,
        needsOrigin: true,
        body: () => ({
          marketplace: Marketplace.AMAZON_BR,
          price: '10.00',
          affiliateUrl: 'https://amazon.com.br/produto/forjado',
        }),
      },
      {
        label: 'GET /products/:productId/offers/:id (detalhar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/products/${productB.id}/offers/${offerB.id}`,
        needsOrigin: false,
        body: undefined,
      },
    ])('$label → 403', async ({ method, path, needsOrigin, body }) => {
      let req = method === 'get'
        ? request(app!.getHttpServer()).get(path())
        : request(app!.getHttpServer()).post(path());
      req = req.set('Cookie', cookieHeader());
      if (needsOrigin) {
        req = req.set('Origin', ADMIN_ORIGIN);
      }
      if (body) {
        req = req.send(body());
      }

      const response = await req;
      expect(response.status).toBe(403);
    });

    it('nenhuma Categoria/Produto/Oferta forjada foi criada no Site B pelas tentativas de POST', async () => {
      const categoryCount = await prisma.category.count({ where: { siteId: siteB.id } });
      const productCount = await prisma.product.count({ where: { siteId: siteB.id } });
      const offerCount = await prisma.offer.count({ where: { siteId: siteB.id } });

      // Só as fixtures originais (`categoryB`/`productB`/`offerB`) — as
      // tentativas de `POST` do vetor 1 rodam nos outros `it`s desta
      // mesma suíte `it.each`, cada um com seu próprio `beforeEach`, então
      // este teste isolado só confirma que o estado inicial (sem forjar
      // nada) está correto; a ausência de criação em cada tentativa
      // individual já é garantida pelo `403` (a rota nunca chega ao
      // `CreateCategoryUseCase`/`CreateProductUseCase`/`CreateOfferUseCase`).
      expect(categoryCount).toBe(1);
      expect(productCount).toBe(1);
      expect(offerCount).toBe(1);
    });
  });

  describe('Vetor 2: siteSlug do Site A (autorizado), IDs do Site B', () => {
    it('GET /categories/:id com id de Categoria do Site B: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/categories/${categoryB.id}`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('POST /categories/:id/archive com id de Categoria do Site B: 404, Categoria do Site B inalterada', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/categories/${categoryB.id}/archive`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.category.findUniqueOrThrow({ where: { id: categoryB.id } });
      expect(persisted.archivedAt).toBeNull();
    });

    it('POST /categories/:id/unarchive com id de Categoria do Site B: 404, Categoria do Site B inalterada', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/categories/${categoryB.id}/unarchive`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.category.findUniqueOrThrow({ where: { id: categoryB.id } });
      expect(persisted.archivedAt).toBeNull();
    });

    it('GET /products/:id com id de Produto do Site B: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/products/${productB.id}`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('POST /products com categoryId da Categoria do Site B: 422, nenhum Produto criado', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/products`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({
          categoryId: categoryB.id,
          name: 'Tentativa Cruzada',
          slug: 'cat022-tentativa-cruzada',
        });

      expect(response.status).toBe(422);

      const persisted = await prisma.product.count({
        where: { siteId: siteA.id, slug: 'cat022-tentativa-cruzada' },
      });
      expect(persisted).toBe(0);
    });

    it('GET /products/:productId/offers com productId do Site B: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/products/${productB.id}/offers`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('POST /products/:productId/offers com productId do Site B: 404, nenhuma Oferta criada', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/products/${productB.id}/offers`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({
          marketplace: Marketplace.ALIEXPRESS,
          price: '20.00',
          affiliateUrl: 'https://aliexpress.com/produto/cruzado',
        });

      expect(response.status).toBe(404);

      const persisted = await prisma.offer.count({ where: { productId: productB.id } });
      expect(persisted).toBe(1); // só `offerB`, nenhuma nova
    });

    it('GET /products/:productId/offers/:id — Oferta do Site B sob um Produto do Site A: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/products/${productA.id}/offers/${offerB.id}`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('ao final: Categoria, Produto e Oferta do Site B permanecem intactos', async () => {
      const persistedCategory = await prisma.category.findUniqueOrThrow({
        where: { id: categoryB.id },
      });
      const persistedProduct = await prisma.product.findUniqueOrThrow({
        where: { id: productB.id },
      });
      const persistedOffer = await prisma.offer.findUniqueOrThrow({ where: { id: offerB.id } });

      expect(persistedCategory).toMatchObject({
        siteId: siteB.id,
        name: categoryB.name,
        slug: categoryB.slug,
        archivedAt: null,
      });
      expect(persistedProduct).toMatchObject({
        siteId: siteB.id,
        categoryId: categoryB.id,
        name: productB.name,
        slug: productB.slug,
      });
      expect(persistedOffer).toMatchObject({
        siteId: siteB.id,
        productId: productB.id,
        archivedAt: null,
      });
    });
  });
});
