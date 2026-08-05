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
import { ArticleStatus, ArticleType, Marketplace, Role } from '../src/generated/prisma/enums';
import type { Article, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'app003-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `DELETE /admin/sites/:siteSlug/products/:id` (e2e, APP-003). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto).
 */
describe('DELETE /admin/sites/:siteSlug/products/:id (e2e)', () => {
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
        name: 'App003 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'app003-site-a',
        name: 'App003 Site A',
        domain: 'app003-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'app003-site-b',
        name: 'App003 Site B',
        domain: 'app003-site-b.test.com',
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
    // `articleProduct`/`offer` antes de `article`/`product`: FKs
    // bloqueariam a exclusão se a ordem fosse invertida.
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'app003-' } } } },
    });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'app003-' } } } });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'app003-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'app003-' } } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: { startsWith: 'app003-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'app003-' } } });
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

  async function createProduct(site: Site, slug: string): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, name: `Produto ${slug}`, slug },
    });
  }

  async function createArticle(
    site: Site,
    slug: string,
    status: ArticleStatus,
  ): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW, status },
    });
  }

  async function linkProductToArticle(site: Site, article: Article, product: Product): Promise<void> {
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position: 0 },
    });
  }

  async function createOffer(site: Site, product: Product): Promise<void> {
    await prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/produto',
      },
    });
  }

  function deleteRequest(site: Site, productId: string) {
    return request(app!.getHttpServer())
      .delete(`/admin/sites/${site.slug}/products/${productId}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: 204 sem corpo, Produto removido do banco (sem vínculo com Artigo, sem Oferta)', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-removivel');

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted).toBeNull();
  });

  it('vinculado a Artigo em DRAFT: 409, Produto e vínculo permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-vinculado-draft');
    const article = await createArticle(siteA, 'artigo-draft', ArticleStatus.DRAFT);
    await linkProductToArticle(siteA, article, product);

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persistedProduct).not.toBeNull();
    const persistedLink = await prisma.articleProduct.findUnique({
      where: { siteId_articleId_productId: { siteId: siteA.id, articleId: article.id, productId: product.id } },
    });
    expect(persistedLink).not.toBeNull();
  });

  it('vinculado a Artigo em PUBLISHED: 409 (regra geral, qualquer status bloqueia)', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-vinculado-published');
    const article = await createArticle(siteA, 'artigo-published', ArticleStatus.PUBLISHED);
    await linkProductToArticle(siteA, article, product);

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persistedProduct).not.toBeNull();
  });

  it('com Oferta cadastrada, sem vínculo com Artigo: 409, Produto e Oferta permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-com-oferta');
    await createOffer(siteA, product);

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persistedProduct).not.toBeNull();
    const offerCount = await prisma.offer.count({ where: { productId: product.id } });
    expect(offerCount).toBe(1);
  });

  it('com Artigo vinculado E Oferta cadastrada: 409 por vínculo com Artigo (LINKED_TO_ARTICLE prevalece)', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-artigo-e-oferta');
    const article = await createArticle(siteA, 'artigo-com-oferta', ArticleStatus.DRAFT);
    await linkProductToArticle(siteA, article, product);
    await createOffer(siteA, product);

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.message).toContain('Artigo');

    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persistedProduct).not.toBeNull();
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Produto real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.OWNER);
    const productFromSiteB = await createProduct(siteB, 'produto-site-b');

    const response = await deleteRequest(siteA, productFromSiteB.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.product.findUnique({ where: { id: productFromSiteB.id } });
    expect(persisted).not.toBeNull();
  });

  it('Role insuficiente (EDITOR): 403, Produto permanece no banco', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'produto-role-insuficiente');

    const response = await deleteRequest(siteA, product.id);

    expect(response.status).toBe(403);

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted).not.toBeNull();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-origem-invalida');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/products/${product.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const product = await createProduct(siteA, 'produto-sem-sessao');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/products/${product.id}`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });
});
