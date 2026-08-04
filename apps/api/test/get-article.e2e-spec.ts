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
import { ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão dos demais e2e do projeto.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt008-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/articles/:id` (e2e, EDT-008). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 */
describe('GET /admin/sites/:siteSlug/articles/:id (e2e)', () => {
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
        name: 'Edt008 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt008-site-a',
        name: 'Edt008 Site A',
        domain: 'edt008-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt008-site-b',
        name: 'Edt008 Site B',
        domain: 'edt008-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'edt008-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt008-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt008-' } } });
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
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        bodyMdx: '# Conteúdo de teste',
      },
    });
  }

  it('sucesso: 200, corpo válido contra articleAdminSchema, incluindo bodyMdx', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-exemplo');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${article.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(articleAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(article.id);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.bodyMdx).toBe('# Conteúdo de teste');
    expect(response.body.status).toBe('DRAFT');
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Artigo real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.VIEWER);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${articleFromSiteB.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/nao-e-um-uuid`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('VIEWER consegue detalhar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-viewer');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles/${article.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-sem-sessao');

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/articles/${article.id}`,
    );

    expect(response.status).toBe(401);
  });
});
