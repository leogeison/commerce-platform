import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, authorAdminSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Author, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão de `create-author.e2e-spec.ts`/`list-authors.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt003-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/authors/:id` (e2e, EDT-003). Exige Postgres
 * real (mesmo requisito de `create-author.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/authors/:id (e2e)', () => {
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
        name: 'Edt003 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt003-site-a',
        name: 'Edt003 Site A',
        domain: 'edt003-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt003-site-b',
        name: 'Edt003 Site B',
        domain: 'edt003-site-b.test.com',
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
    // e2e de Author.
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt003-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt003-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt003-' } } });
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

  async function createAuthor(site: Site, name: string): Promise<Author> {
    return prisma.author.create({
      data: { siteId: site.id, name },
    });
  }

  it('sucesso: 200, corpo válido contra authorAdminSchema', async () => {
    await setRole(siteA, Role.VIEWER);
    const author = await createAuthor(siteA, 'Autora Exemplo');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(authorAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(author.id);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.userId).toBeNull();
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Author real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.VIEWER);
    const authorFromSiteB = await createAuthor(siteB, 'Do Site B');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors/${authorFromSiteB.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors/nao-e-um-uuid`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('VIEWER consegue detalhar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const author = await createAuthor(siteA, 'Autor Casa');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const author = await createAuthor(siteA, 'Autor Moda');

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/authors/${author.id}`,
    );

    expect(response.status).toBe(401);
  });
});
