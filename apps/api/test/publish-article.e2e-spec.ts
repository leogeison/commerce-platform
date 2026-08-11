import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, articleAdminSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Marketplace, Role } from '../src/generated/prisma/enums';
import type { Article, Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev003-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/publish` (e2e, REV-003).
 * Exige Postgres real (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (publicar + tentar revalidar + nunca desfazer a publicação
 * por falha de revalidação), não a chamada HTTP real de `HttpRevalidationAdapter`
 * (já coberta em `http-revalidation.adapter.spec.ts`).
 */
describe('POST /admin/sites/:siteSlug/articles/:id/publish (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let token: string;
  let revalidationPort: jest.Mocked<RevalidationPort>;

  beforeEach(async () => {
    revalidationPort = { revalidate: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    })
      .overrideProvider(REVALIDATION_PORT)
      .useValue(revalidationPort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Rev003 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev003-site-a',
        name: 'Rev003 Site A',
        domain: 'rev003-site-a.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: siteA.id, role: Role.EDITOR, active: true },
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
      where: { article: { site: { slug: { startsWith: 'rev003-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev003-' } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'rev003-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'rev003-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'rev003-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev003-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev003-' } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  async function createPublishableArticle(slug: string): Promise<Article> {
    const category: Category = await prisma.category.create({
      data: { siteId: siteA.id, name: `Categoria ${slug}`, slug: `categoria-${slug}` },
    });
    const product: Product = await prisma.product.create({
      data: { siteId: siteA.id, name: `Produto ${slug}`, slug: `produto-${slug}` },
    });
    await prisma.offer.create({
      data: {
        siteId: siteA.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/produto',
      },
    });
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        categoryId: category.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status: ArticleStatus.PENDING_REVIEW,
        metaDescription: 'Descrição válida para SEO.',
        coverImageUrl: 'https://cdn.test.com/capa.jpg',
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id, position: 0 },
    });

    return article;
  }

  async function createDraftArticle(slug: string): Promise<Article> {
    return prisma.article.create({
      data: { siteId: siteA.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW },
    });
  }

  it('sucesso com revalidação bem-sucedida: 200, status PUBLISHED no corpo e no banco, revalida com siteSlug/articleSlug corretos', async () => {
    const article = await createPublishableArticle('artigo-publicavel');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(articleAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.status).toBe('PUBLISHED');
    expect(response.body.publishedAt).not.toBeNull();

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('PUBLISHED');

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: 'artigo-publicavel',
    });
  });

  it('sucesso com revalidação falhando: ainda 200, status PUBLISHED persiste no banco (falha de revalidação não desfaz publicação)', async () => {
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const article = await createPublishableArticle('artigo-revalidacao-falha');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PUBLISHED');

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });

  it('artigo inexistente: 404, revalidação nunca chamada', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${NONEXISTENT_ID}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('condições de publicação não atendidas (artigo em DRAFT, sem Categoria/Produto/capa): 422 com issues, revalidação nunca chamada', async () => {
    const article = await createDraftArticle('artigo-nao-publicavel');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        'WRONG_STATUS',
        'CATEGORY_INACTIVE',
        'NO_PRODUCTS',
        'META_DESCRIPTION_MISSING',
        'COVER_IMAGE_MISSING',
      ]),
    );

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('DRAFT');
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });
});
