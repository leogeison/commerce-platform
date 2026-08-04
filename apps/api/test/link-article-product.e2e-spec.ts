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
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt010-link-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/products` (e2e, EDT-010).
 * Exige Postgres real (mesmo requisito dos demais e2e do projeto).
 */
describe('POST /admin/sites/:siteSlug/articles/:id/products (e2e)', () => {
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
        name: 'Edt010 Link User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt010-link-site-a',
        name: 'Edt010 Link Site A',
        domain: 'edt010-link-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt010-link-site-b',
        name: 'Edt010 Link Site B',
        domain: 'edt010-link-site-b.test.com',
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
      where: { article: { site: { slug: { startsWith: 'edt010-link-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-link-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-link-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-link-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt010-link-' } } });
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

  async function createArticle(
    site: Site,
    slug: string,
    status: ArticleStatus = ArticleStatus.DRAFT,
  ): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW, status },
    });
  }

  async function createProduct(site: Site, slug: string): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, name: `Produto ${slug}`, slug },
    });
  }

  function linkRequest(site: Site, articleId: string) {
    return request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: primeiro Produto vinculado entra na posição 0, resposta válida contra articleProductsResponseSchema', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-primeiro');
    const product = await createProduct(siteA, 'produto-link-primeiro');

    const response = await linkRequest(siteA, article.id).send({ productId: product.id });

    expect(response.status).toBe(201);
    expect(articleProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.productIds).toEqual([product.id]);

    const persisted = await prisma.articleProduct.findUnique({
      where: {
        siteId_articleId_productId: { siteId: siteA.id, articleId: article.id, productId: product.id },
      },
    });
    expect(persisted?.position).toBe(0);
  });

  it('sucesso: segundo Produto vinculado entra no fim (posição 1), resposta reflete a coleção completa', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-segundo');
    const first = await createProduct(siteA, 'produto-link-a');
    const second = await createProduct(siteA, 'produto-link-b');

    await linkRequest(siteA, article.id).send({ productId: first.id });
    const response = await linkRequest(siteA, article.id).send({ productId: second.id });

    expect(response.status).toBe(201);
    expect(response.body.productIds).toEqual([first.id, second.id]);

    const persisted = await prisma.articleProduct.findUnique({
      where: {
        siteId_articleId_productId: { siteId: siteA.id, articleId: article.id, productId: second.id },
      },
    });
    expect(persisted?.position).toBe(1);
  });

  it('Produto já vinculado ao mesmo Artigo: 409, sem segunda linha criada', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-duplicado');
    const product = await createProduct(siteA, 'produto-link-duplicado');

    await linkRequest(siteA, article.id).send({ productId: product.id });
    const response = await linkRequest(siteA, article.id).send({ productId: product.id });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const count = await prisma.articleProduct.count({
      where: { siteId: siteA.id, articleId: article.id, productId: product.id },
    });
    expect(count).toBe(1);
  });

  it('productId com UUID válido mas inexistente: 422 PRODUCT_NOT_FOUND', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-produto-inexistente');

    const response = await linkRequest(siteA, article.id).send({ productId: NONEXISTENT_ID });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('productId de um Produto real, mas de outro Site: 422 PRODUCT_NOT_FOUND (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-produto-outro-site');
    const productFromSiteB = await createProduct(siteB, 'produto-site-b');

    const response = await linkRequest(siteA, article.id).send({ productId: productFromSiteB.id });

    expect(response.status).toBe(422);
  });

  it('articleId inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'produto-link-artigo-inexistente');

    const response = await linkRequest(siteA, NONEXISTENT_ID).send({ productId: product.id });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('articleId de um Artigo real de outro Site: 404 (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');
    const product = await createProduct(siteA, 'produto-link-artigo-outro-site');

    const response = await linkRequest(siteA, articleFromSiteB.id).send({ productId: product.id });

    expect(response.status).toBe(404);
  });

  it('Artigo fora de DRAFT: 409, nada vinculado', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-nao-draft', ArticleStatus.PUBLISHED);
    const product = await createProduct(siteA, 'produto-link-nao-draft');

    const response = await linkRequest(siteA, article.id).send({ productId: product.id });

    expect(response.status).toBe(409);

    const count = await prisma.articleProduct.count({
      where: { siteId: siteA.id, articleId: article.id },
    });
    expect(count).toBe(0);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-link-role-insuficiente');
    const product = await createProduct(siteA, 'produto-link-role-insuficiente');

    const response = await linkRequest(siteA, article.id).send({ productId: product.id });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-origem-invalida');
    const product = await createProduct(siteA, 'produto-link-origem-invalida');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ productId: product.id });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-sem-sessao');
    const product = await createProduct(siteA, 'produto-link-sem-sessao');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/products`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ productId: product.id });

    expect(response.status).toBe(401);
  });

  it('articleId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'produto-link-id-invalido');

    const response = await linkRequest(siteA, 'nao-e-um-uuid').send({ productId: product.id });

    expect(response.status).toBe(422);
  });

  it('productId com formato inválido no corpo (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-link-product-id-invalido');

    const response = await linkRequest(siteA, article.id).send({ productId: 'nao-e-um-uuid' });

    expect(response.status).toBe(422);
  });
});
