import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, articleHealthResponseSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Marketplace, Role } from '../src/generated/prisma/enums';
import type { Article, Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão dos demais e2e do projeto.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'app001-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `GET /admin/sites/:siteSlug/articles/:id/health` (e2e mínimo, APP-001).
 * Exige Postgres real (mesmo requisito dos demais e2e do projeto).
 *
 * Não repete a matriz de 12 casos (saudável/produto sem Oferta
 * válida/sem Produto × 4 status) — já coberta em
 * `calculate-article-health.use-case.spec.ts` (unitário, sem Postgres).
 * Este arquivo só confirma que a rota está corretamente ligada,
 * autorizada e tenant-aware.
 */
describe('GET /admin/sites/:siteSlug/articles/:id/health (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'App001 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'app001-site-a',
        name: 'App001 Site A',
        domain: 'app001-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'app001-site-b',
        name: 'App001 Site B',
        domain: 'app001-site-b.test.com',
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
      where: { article: { site: { slug: { startsWith: 'app001-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'app001-' } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'app001-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'app001-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'app001-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'app001-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'app001-' } } });
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

  async function createHealthyArticle(site: Site, slug: string): Promise<Article> {
    const category: Category = await prisma.category.create({
      data: { siteId: site.id, name: `Categoria ${slug}`, slug: `categoria-${slug}` },
    });
    const product: Product = await prisma.product.create({
      data: { siteId: site.id, name: `Produto ${slug}`, slug: `produto-${slug}` },
    });
    await prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/produto',
      },
    });
    const article = await prisma.article.create({
      data: {
        siteId: site.id,
        categoryId: category.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        metaDescription: 'Descrição válida para SEO.',
        coverImageUrl: 'https://cdn.test.com/capa.jpg',
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position: 0 },
    });

    return article;
  }

  async function createBareArticle(site: Site, slug: string): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW },
    });
  }

  it('sucesso: 200, corpo válido contra articleHealthResponseSchema, healthy = true', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createHealthyArticle(siteA, 'artigo-saudavel');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${article.id}/health`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(articleHealthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      categoryActive: true,
      hasAtLeastOneProduct: true,
      allProductsHaveValidOffer: true,
      invalidProducts: [],
      slugUnique: true,
      metaDescriptionFilled: true,
      coverImagePresent: true,
      healthy: true,
    });
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${NONEXISTENT_ID}/health`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Artigo real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.VIEWER);
    const articleFromSiteB = await createBareArticle(siteB, 'artigo-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${articleFromSiteB.id}/health`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('VIEWER consegue consultar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createBareArticle(siteA, 'artigo-viewer');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${article.id}/health`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createBareArticle(siteA, 'artigo-sem-sessao');

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/articles/${article.id}/health`,
    );

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/nao-e-um-uuid/health`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
