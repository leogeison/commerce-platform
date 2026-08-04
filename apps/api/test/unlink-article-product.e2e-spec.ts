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
const USER_EMAIL = 'edt010-unlink-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `DELETE /admin/sites/:siteSlug/articles/:id/products/:productId` (e2e,
 * EDT-010). Exige Postgres real (mesmo requisito dos demais e2e do
 * projeto).
 */
describe('DELETE /admin/sites/:siteSlug/articles/:id/products/:productId (e2e)', () => {
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
        name: 'Edt010 Unlink User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt010-unlink-site-a',
        name: 'Edt010 Unlink Site A',
        domain: 'edt010-unlink-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt010-unlink-site-b',
        name: 'Edt010 Unlink Site B',
        domain: 'edt010-unlink-site-b.test.com',
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
      where: { article: { site: { slug: { startsWith: 'edt010-unlink-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-unlink-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-unlink-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt010-unlink-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt010-unlink-' } } });
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

  function unlinkRequest(site: Site, articleId: string, productId: string) {
    return request(app!.getHttpServer())
      .delete(`/admin/sites/${site.slug}/articles/${articleId}/products/${productId}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: remove o vínculo do meio e recompacta as posições restantes (0,1,2 → 0,1)', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-recompacta');
    const first = await createProduct(siteA, 'produto-unlink-a');
    const middle = await createProduct(siteA, 'produto-unlink-b');
    const last = await createProduct(siteA, 'produto-unlink-c');
    await linkProduct(siteA, article, first, 0);
    await linkProduct(siteA, article, middle, 1);
    await linkProduct(siteA, article, last, 2);

    const response = await unlinkRequest(siteA, article.id, middle.id);

    expect(response.status).toBe(200);
    expect(articleProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.productIds).toEqual([first.id, last.id]);

    const remaining = await prisma.articleProduct.findMany({
      where: { siteId: siteA.id, articleId: article.id },
      orderBy: { position: 'asc' },
    });
    expect(remaining.map((r) => ({ productId: r.productId, position: r.position }))).toEqual([
      { productId: first.id, position: 0 },
      { productId: last.id, position: 1 },
    ]);

    const removed = await prisma.articleProduct.findUnique({
      where: {
        siteId_articleId_productId: { siteId: siteA.id, articleId: article.id, productId: middle.id },
      },
    });
    expect(removed).toBeNull();
  });

  it('Produto real, mas nunca vinculado a este Artigo: 404 NOT_LINKED', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-nao-vinculado');
    const product = await createProduct(siteA, 'produto-unlink-nao-vinculado');

    const response = await unlinkRequest(siteA, article.id, product.id);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('articleId inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await unlinkRequest(siteA, NONEXISTENT_ID, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('articleId de um Artigo real de outro Site: 404 (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');
    const productFromSiteB = await createProduct(siteB, 'produto-site-b');
    await linkProduct(siteB, articleFromSiteB, productFromSiteB, 0);

    const response = await unlinkRequest(siteA, articleFromSiteB.id, productFromSiteB.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.articleProduct.findUnique({
      where: {
        siteId_articleId_productId: {
          siteId: siteB.id,
          articleId: articleFromSiteB.id,
          productId: productFromSiteB.id,
        },
      },
    });
    expect(persisted).not.toBeNull();
  });

  it('Artigo fora de DRAFT: 409, vínculo permanece intacto', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-nao-draft', ArticleStatus.PUBLISHED);
    const product = await createProduct(siteA, 'produto-unlink-nao-draft');
    await linkProduct(siteA, article, product, 0);

    const response = await unlinkRequest(siteA, article.id, product.id);

    expect(response.status).toBe(409);

    const persisted = await prisma.articleProduct.findUnique({
      where: {
        siteId_articleId_productId: { siteId: siteA.id, articleId: article.id, productId: product.id },
      },
    });
    expect(persisted).not.toBeNull();
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-unlink-role-insuficiente');
    const product = await createProduct(siteA, 'produto-unlink-role-insuficiente');
    await linkProduct(siteA, article, product, 0);

    const response = await unlinkRequest(siteA, article.id, product.id);

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-origem-invalida');
    const product = await createProduct(siteA, 'produto-unlink-origem-invalida');
    await linkProduct(siteA, article, product, 0);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/articles/${article.id}/products/${product.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-sem-sessao');
    const product = await createProduct(siteA, 'produto-unlink-sem-sessao');
    await linkProduct(siteA, article, product, 0);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/articles/${article.id}/products/${product.id}`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('articleId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await unlinkRequest(siteA, 'nao-e-um-uuid', NONEXISTENT_ID);

    expect(response.status).toBe(422);
  });

  it('productId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-unlink-product-id-invalido');

    const response = await unlinkRequest(siteA, article.id, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });
});
