import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'app006-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `DELETE /admin/sites/:siteSlug/categories/:id` (e2e, APP-006). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto). Mesmos
 * moldes exatos de `remove-product.e2e-spec.ts` (APP-003).
 */
describe('DELETE /admin/sites/:siteSlug/categories/:id (e2e)', () => {
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
        name: 'App006 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'app006-site-a',
        name: 'App006 Site A',
        domain: 'app006-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'app006-site-b',
        name: 'App006 Site B',
        domain: 'app006-site-b.test.com',
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
    // `article`/`product` antes de `category`: FKs bloqueariam a exclusão
    // se a ordem fosse invertida.
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'app006-' } } },
    });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'app006-' } } } });
    await prisma.category.deleteMany({ where: { site: { slug: { startsWith: 'app006-' } } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: { startsWith: 'app006-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'app006-' } } });
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

  async function createCategory(site: Site, slug: string): Promise<Category> {
    return prisma.category.create({
      data: { siteId: site.id, name: `Categoria ${slug}`, slug },
    });
  }

  async function createProductInCategory(site: Site, category: Category, slug: string): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, categoryId: category.id, name: `Produto ${slug}`, slug },
    });
  }

  async function createArticleInCategory(
    site: Site,
    category: Category,
    slug: string,
    status: ArticleStatus,
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        categoryId: category.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status,
      },
    });
  }

  function deleteRequest(site: Site, categoryId: string) {
    return request(app!.getHttpServer())
      .delete(`/admin/sites/${site.slug}/categories/${categoryId}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: 204 sem corpo, Categoria removida do banco (sem vínculo com Artigo, sem Produto)', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-removivel');

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted).toBeNull();
  });

  it('vinculada a Artigo em DRAFT: 409, Categoria e Artigo permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-vinculada-draft');
    const article = await createArticleInCategory(siteA, category, 'artigo-draft', ArticleStatus.DRAFT);

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedCategory = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persistedCategory).not.toBeNull();
    const persistedArticle = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persistedArticle).not.toBeNull();
  });

  it('vinculada a Artigo em PUBLISHED: 409 (regra geral, qualquer status bloqueia)', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-vinculada-published');
    await createArticleInCategory(siteA, category, 'artigo-published', ArticleStatus.PUBLISHED);

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedCategory = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persistedCategory).not.toBeNull();
  });

  it('com Produto cadastrado, sem vínculo com Artigo: 409, Categoria e Produto permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-com-produto');
    const product = await createProductInCategory(siteA, category, 'produto-da-categoria');

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedCategory = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persistedCategory).not.toBeNull();
    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persistedProduct).not.toBeNull();
  });

  it('com Artigo vinculado E Produto cadastrado: 409 por vínculo com Artigo (LINKED_TO_ARTICLE prevalece)', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-artigo-e-produto');
    await createArticleInCategory(siteA, category, 'artigo-com-produto', ArticleStatus.DRAFT);
    await createProductInCategory(siteA, category, 'produto-com-artigo');

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.message).toContain('Artigo');

    const persistedCategory = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persistedCategory).not.toBeNull();
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Categoria real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.OWNER);
    const categoryFromSiteB = await createCategory(siteB, 'categoria-site-b');

    const response = await deleteRequest(siteA, categoryFromSiteB.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.category.findUnique({ where: { id: categoryFromSiteB.id } });
    expect(persisted).not.toBeNull();
  });

  it('Role insuficiente (EDITOR): 403, Categoria permanece no banco', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'categoria-role-insuficiente');

    const response = await deleteRequest(siteA, category.id);

    expect(response.status).toBe(403);

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted).not.toBeNull();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-origem-invalida');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/categories/${category.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'categoria-sem-sessao');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/categories/${category.id}`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });
});
