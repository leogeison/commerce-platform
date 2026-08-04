import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, articleAdminSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
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
const USER_EMAIL = 'edt013-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/revert-to-draft` (e2e,
 * EDT-013). Exige Postgres real (mesmo requisito dos demais e2e do
 * projeto).
 */
describe('POST /admin/sites/:siteSlug/articles/:id/revert-to-draft (e2e)', () => {
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
        name: 'Edt013 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt013-site-a',
        name: 'Edt013 Site A',
        domain: 'edt013-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt013-site-b',
        name: 'Edt013 Site B',
        domain: 'edt013-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'edt013-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt013-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt013-' } } });
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
    status: ArticleStatus = ArticleStatus.PENDING_REVIEW,
  ): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW, status },
    });
  }

  function revertRequest(site: Site, articleId: string) {
    return request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/revert-to-draft`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('PENDING_REVIEW → DRAFT: 200, corpo válido contra articleAdminSchema', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(
      siteA,
      'artigo-revert-sucesso',
      ArticleStatus.PENDING_REVIEW,
    );

    const response = await revertRequest(siteA, article.id);

    expect(response.status).toBe(200);
    expect(articleAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.status).toBe('DRAFT');

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('DRAFT');
  });

  it.each([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])(
    'status de origem inválido (%s): 409, status não muda',
    async (status) => {
      await setRole(siteA, Role.EDITOR);
      const article = await createArticle(siteA, `artigo-revert-invalido-${status.toLowerCase()}`, status);

      const response = await revertRequest(siteA, article.id);

      expect(response.status).toBe(409);
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

      const persisted = await prisma.article.findUnique({ where: { id: article.id } });
      expect(persisted?.status).toBe(status);
    },
  );

  it('articleId inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await revertRequest(siteA, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('articleId de um Artigo real de outro Site: 404 (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');

    const response = await revertRequest(siteA, articleFromSiteB.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.article.findUnique({ where: { id: articleFromSiteB.id } });
    expect(persisted?.status).toBe('PENDING_REVIEW');
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-revert-role-insuficiente');

    const response = await revertRequest(siteA, article.id);

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-revert-origem-invalida');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/revert-to-draft`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-revert-sem-sessao');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/revert-to-draft`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('articleId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await revertRequest(siteA, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });
});
