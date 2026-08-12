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
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev004-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/archive` (e2e). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (arquivar + tentar revalidar + nunca desfazer o
 * arquivamento por falha de revalidação), não a chamada HTTP real de
 * `HttpRevalidationAdapter` (já coberta em `http-revalidation.adapter.spec.ts`).
 */
describe('POST /admin/sites/:siteSlug/articles/:id/archive (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
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
        name: 'Rev004 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev004-site-a',
        name: 'Rev004 Site A',
        domain: 'rev004-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev004-site-b',
        name: 'Rev004 Site B',
        domain: 'rev004-site-b.test.com',
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
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev004-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev004-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev004-' } } });
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

  function archiveUrl(site: Site, articleId: string): string {
    return `/admin/sites/${site.slug}/articles/${articleId}/archive`;
  }

  async function createArticle(
    site: Site,
    slug: string,
    status: ArticleStatus,
    publishedAt: Date | null = null,
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status,
        publishedAt,
      },
    });
  }

  it('OWNER arquiva Artigo PUBLISHED: 200, status ARCHIVED no corpo e no banco, publishedAt preservado, revalida com siteSlug/articleSlug corretos', async () => {
    await setRole(siteA, Role.OWNER);
    const publishedAt = new Date('2026-01-10T12:00:00.000Z');
    const article = await createArticle(siteA, 'artigo-arquivavel', ArticleStatus.PUBLISHED, publishedAt);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(articleAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.status).toBe('ARCHIVED');
    expect(response.body.publishedAt).toBe(publishedAt.toISOString());

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('ARCHIVED');
    expect(persisted?.publishedAt?.toISOString()).toBe(publishedAt.toISOString());

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: 'artigo-arquivavel',
    });
  });

  it('sucesso com revalidação falhando: ainda 200, status ARCHIVED persiste no banco (falha de revalidação não desfaz o arquivamento)', async () => {
    await setRole(siteA, Role.OWNER);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const article = await createArticle(siteA, 'artigo-revalidacao-falha', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ARCHIVED');

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('ARCHIVED');
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('artigo inexistente: 404, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('id de Artigo real de outro Site: 404 (isolamento), revalidação nunca chamada', async () => {
    await setRole(siteA, Role.OWNER);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, articleFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.article.findUnique({ where: { id: articleFromSiteB.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });

  it.each([
    ['DRAFT', ArticleStatus.DRAFT],
    ['PENDING_REVIEW', ArticleStatus.PENDING_REVIEW],
    ['ARCHIVED (já arquivado)', ArticleStatus.ARCHIVED],
  ])('status de origem inválido (%s): 409, nada persistido além do status original, revalidação nunca chamada', async (_label, status) => {
    await setRole(siteA, Role.OWNER);
    const article = await createArticle(siteA, `artigo-status-invalido-${status.toLowerCase()}`, status);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe(status);
  });

  it('Role insuficiente (EDITOR): 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-role-insuficiente', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(403);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const article = await createArticle(siteA, 'artigo-origin-invalida', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const article = await createArticle(siteA, 'artigo-sem-autenticacao', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, article.id))
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(archiveUrl(siteA, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(422);
  });
});
