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
const USER_EMAIL = 'edt010-reorder-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/articles/:id/products/reorder` (e2e,
 * EDT-010). Exige Postgres real (mesmo requisito dos demais e2e do
 * projeto).
 */
describe('PATCH /admin/sites/:siteSlug/articles/:id/products/reorder (e2e)', () => {
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
        name: 'Edt010 Reorder User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt010-reorder-site-a',
        name: 'Edt010 Reorder Site A',
        domain: 'edt010-reorder-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt010-reorder-site-b',
        name: 'Edt010 Reorder Site B',
        domain: 'edt010-reorder-site-b.test.com',
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
      where: { article: { site: { slug: { startsWith: 'edt010-reorder-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-reorder-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-reorder-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-reorder-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt010-reorder-' } } });
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

  async function linkProduct(site: Site, article: Article, product: Product, position: number) {
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position },
    });
  }

  function reorderRequest(site: Site, articleId: string) {
    return request(app!.getHttpServer())
      .patch(`/admin/sites/${site.slug}/articles/${articleId}/products/reorder`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: inverte a ordem de 3 Produtos, positions refletem o novo índice', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-inverte');
    const first = await createProduct(siteA, 'produto-reorder-a');
    const second = await createProduct(siteA, 'produto-reorder-b');
    const third = await createProduct(siteA, 'produto-reorder-c');
    await linkProduct(siteA, article, first, 0);
    await linkProduct(siteA, article, second, 1);
    await linkProduct(siteA, article, third, 2);

    const response = await reorderRequest(siteA, article.id).send({
      productIds: [third.id, second.id, first.id],
    });

    expect(response.status).toBe(200);
    expect(articleProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.productIds).toEqual([third.id, second.id, first.id]);

    const persisted = await prisma.articleProduct.findMany({
      where: { siteId: siteA.id, articleId: article.id },
      orderBy: { position: 'asc' },
    });
    expect(persisted.map((p) => p.productId)).toEqual([third.id, second.id, first.id]);
    expect(persisted.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('lista vazia quando a coleção atual também está vazia: 200, productIds: []', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-vazio');

    const response = await reorderRequest(siteA, article.id).send({ productIds: [] });

    expect(response.status).toBe(200);
    expect(response.body.productIds).toEqual([]);
  });

  it('lista vazia quando a coleção atual NÃO está vazia: 422 INVALID_PRODUCT_SET', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-vazio-invalido');
    const product = await createProduct(siteA, 'produto-reorder-vazio-invalido');
    await linkProduct(siteA, article, product, 0);

    const response = await reorderRequest(siteA, article.id).send({ productIds: [] });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('conjunto incompleto (falta um productId vinculado): 422 INVALID_PRODUCT_SET, posições não mudam', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-incompleto');
    const first = await createProduct(siteA, 'produto-reorder-incompleto-a');
    const second = await createProduct(siteA, 'produto-reorder-incompleto-b');
    await linkProduct(siteA, article, first, 0);
    await linkProduct(siteA, article, second, 1);

    const response = await reorderRequest(siteA, article.id).send({ productIds: [second.id] });

    expect(response.status).toBe(422);

    const persisted = await prisma.articleProduct.findMany({
      where: { siteId: siteA.id, articleId: article.id },
      orderBy: { position: 'asc' },
    });
    expect(persisted.map((p) => ({ productId: p.productId, position: p.position }))).toEqual([
      { productId: first.id, position: 0 },
      { productId: second.id, position: 1 },
    ]);
  });

  it('conjunto com productId extra (não vinculado a este Artigo): 422 INVALID_PRODUCT_SET', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-extra');
    const linked = await createProduct(siteA, 'produto-reorder-extra-vinculado');
    const notLinked = await createProduct(siteA, 'produto-reorder-extra-nao-vinculado');
    await linkProduct(siteA, article, linked, 0);

    const response = await reorderRequest(siteA, article.id).send({
      productIds: [linked.id, notLinked.id],
    });

    expect(response.status).toBe(422);
  });

  it('productIds duplicados: 422 (rejeitado na validação de forma do contrato)', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-duplicado');
    const product = await createProduct(siteA, 'produto-reorder-duplicado');
    await linkProduct(siteA, article, product, 0);

    const response = await reorderRequest(siteA, article.id).send({
      productIds: [product.id, product.id],
    });

    expect(response.status).toBe(422);
  });

  it('articleId inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await reorderRequest(siteA, NONEXISTENT_ID).send({ productIds: [] });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('articleId de um Artigo real de outro Site: 404 (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');

    const response = await reorderRequest(siteA, articleFromSiteB.id).send({ productIds: [] });

    expect(response.status).toBe(404);
  });

  it('Artigo fora de DRAFT: 409, posições não mudam', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(
      siteA,
      'artigo-reorder-nao-draft',
      ArticleStatus.PUBLISHED,
    );
    const first = await createProduct(siteA, 'produto-reorder-nao-draft-a');
    const second = await createProduct(siteA, 'produto-reorder-nao-draft-b');
    await linkProduct(siteA, article, first, 0);
    await linkProduct(siteA, article, second, 1);

    const response = await reorderRequest(siteA, article.id).send({
      productIds: [second.id, first.id],
    });

    expect(response.status).toBe(409);

    const persisted = await prisma.articleProduct.findMany({
      where: { siteId: siteA.id, articleId: article.id },
      orderBy: { position: 'asc' },
    });
    expect(persisted.map((p) => p.productId)).toEqual([first.id, second.id]);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-reorder-role-insuficiente');

    const response = await reorderRequest(siteA, article.id).send({ productIds: [] });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-origem-invalida');

    const response = await request(app!.getHttpServer())
      .patch(`/admin/sites/${siteA.slug}/articles/${article.id}/products/reorder`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ productIds: [] });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-reorder-sem-sessao');

    const response = await request(app!.getHttpServer())
      .patch(`/admin/sites/${siteA.slug}/articles/${article.id}/products/reorder`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ productIds: [] });

    expect(response.status).toBe(401);
  });

  it('articleId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await reorderRequest(siteA, 'nao-e-um-uuid').send({ productIds: [] });

    expect(response.status).toBe(422);
  });
});
