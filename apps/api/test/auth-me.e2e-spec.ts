import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';

const SEED_EMAIL = 'auth008-me@test.com';
const SEED_NAME = 'Auth008 Seed';
const SESSION_SECRET = process.env.SESSION_SECRET!;

/**
 * Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * `app.use(cookieParser())`: `/admin/auth/me` é protegido por
 * `SessionAuthGuard` (AUTH-006), que depende de `request.cookies`
 * populado — mesma necessidade já documentada em
 * `session-auth.guard.e2e-spec.ts`/`auth-logout.e2e-spec.ts`.
 */
describe('GET /admin/auth/me (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let userId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        email: SEED_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: SEED_NAME,
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // SiteUser/Site antes de Session/User: nenhuma dessas relações tem
    // cascade (Architecture.md — "praticamente todo onDelete é Restrict"),
    // então a ordem de limpeza importa de verdade aqui.
    await prisma.siteUser.deleteMany({ where: { userId } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'auth008-' } } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  /** Cria uma Session de fixture (ativa, não expirada) e devolve o token BRUTO. */
  async function createSessionCookie(): Promise<string> {
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);

    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    return rawToken;
  }

  it('usuário sem nenhum SiteUser: 200, sites vazio', async () => {
    const rawToken = await createSessionCookie();

    const response = await request(app!.getHttpServer())
      .get('/admin/auth/me')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: userId, email: SEED_EMAIL, name: SEED_NAME },
      sites: [],
    });
  });

  it('um SiteUser ativo e um inativo: só o ativo aparece em sites, com a role correta', async () => {
    const rawToken = await createSessionCookie();

    const activeSite = await prisma.site.create({
      data: {
        slug: 'auth008-active-site',
        name: 'Auth008 Active Site',
        domain: 'auth008-active.test.com',
        locale: 'pt-BR',
      },
    });
    const inactiveSite = await prisma.site.create({
      data: {
        slug: 'auth008-inactive-site',
        name: 'Auth008 Inactive Site',
        domain: 'auth008-inactive.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId, siteId: activeSite.id, role: Role.OWNER, active: true },
    });
    await prisma.siteUser.create({
      data: { userId, siteId: inactiveSite.id, role: Role.EDITOR, active: false },
    });

    const response = await request(app!.getHttpServer())
      .get('/admin/auth/me')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: userId, email: SEED_EMAIL, name: SEED_NAME },
      sites: [
        {
          siteId: activeSite.id,
          siteSlug: activeSite.slug,
          siteName: activeSite.name,
          role: 'OWNER',
        },
      ],
    });
  });

  it('cookie ausente: 401', async () => {
    const response = await request(app!.getHttpServer()).get('/admin/auth/me');

    expect(response.status).toBe(401);
  });
});
