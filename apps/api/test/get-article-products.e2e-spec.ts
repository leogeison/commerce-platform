import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, articleProductsResponseSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão dos demais e2e do projeto.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt010-getproducts-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `GET /admin/sites/:siteSlug/articles/:id/products` (e2e, incremento
 * ADM-009 sobre EDT-010). Exige Postgres real (mesmo requisito dos demais
 * e2e do projeto).
 */
describe('GET /admin/sites/:siteSlug/articles/:id/products (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Edt010 GetProducts User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt010-getproducts-site-a',
        name: 'Edt010 GetProducts Site A',
        domain: 'edt010-getproducts-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt010-getproducts-site-b',
        name: 'Edt010 GetProducts Site B',
        domain: 'edt010-getproducts-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais
    // e2e. `articleProduct` antes de `article`/`product`: FKs bloqueariam
    // a exclusão se a ordem fosse invertida.
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'edt010-getproducts-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-getproducts-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-getproducts-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-getproducts-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt010-getproducts-' } } });
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

  async function createArticle(site: Site, slug: string): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW },
    });
  }

  async function createProduct(site: Site, slug: string): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, name: `Produto ${slug}`, slug },
    });
  }

  async function linkAt(site: Site, article: Article, product: Product, position: number): Promise<void> {
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position },
    });
  }

  function getRequest(site: Site, articleId: string) {
    return request(app!.getHttpServer())
      .get(`/admin/sites/${site.slug}/articles/${articleId}/products`)
      .set('Cookie', cookieHeader());
  }

  it('Artigo sem Produtos vinculados: 200, productIds vazio', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-sem-produtos');

    const response = await getRequest(siteA, article.id);

    expect(response.status).toBe(200);
    expect(articleProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.productIds).toEqual([]);
  });

  it('Artigo com Produtos vinculados: 200, productIds na ordem de position', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-com-produtos');
    const productFirst = await createProduct(siteA, 'produto-primeiro');
    const productSecond = await createProduct(siteA, 'produto-segundo');
    const productThird = await createProduct(siteA, 'produto-terceiro');
    // Insere fora de ordem de criação, na ordem de `position` esperada.
    await linkAt(siteA, article, productSecond, 1);
    await linkAt(siteA, article, productFirst, 0);
    await linkAt(siteA, article, productThird, 2);

    const response = await getRequest(siteA, article.id);

    expect(response.status).toBe(200);
    expect(response.body.productIds).toEqual([productFirst.id, productSecond.id, productThird.id]);
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await getRequest(siteA, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Artigo real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.VIEWER);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');

    const response = await getRequest(siteA, articleFromSiteB.id);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await getRequest(siteA, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });

  it('VIEWER consegue consultar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-viewer');

    const response = await getRequest(siteA, article.id);

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-sem-sessao');

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/articles/${article.id}/products`,
    );

    expect(response.status).toBe(401);
  });
});
