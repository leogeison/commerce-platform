import {
  Controller,
  Get,
  INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { SessionAuthGuard } from '../src/modules/identity/presentation/session-auth.guard';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { TenancyModule } from '../src/modules/tenancy/tenancy.module';
import { SiteAuthorizationGuard } from '../src/modules/tenancy/presentation/site-authorization.guard';
import { MinRole } from '../src/modules/tenancy/presentation/min-role.decorator';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Site } from '../src/generated/prisma/client';

const SEED_EMAIL = 'auth009-authz@test.com';
const SEED_NAME = 'Auth009 Seed';
const SESSION_SECRET = process.env.SESSION_SECRET!;

/**
 * Controller só de teste, mesmo padrão de `TestProtectedController`
 * (`session-auth.guard.e2e-spec.ts`): nenhuma rota real usa
 * `SiteAuthorizationGuard` ainda (Catalog/Editorial vêm nas fases
 * seguintes). Duas rotas com `@MinRole` diferentes (`editor`/`owner`) pra
 * provar a hierarquia com dois patamares, e uma sem `@MinRole` nenhum pra
 * provar o "falha fechado".
 */
@Controller('test-site/:siteSlug')
class TestSiteController {
  @Get('editor')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  editorOnly(@Req() req: Request) {
    return req.tenant;
  }

  @Get('owner')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  ownerOnly(@Req() req: Request) {
    return req.tenant;
  }

  @Get('no-min-role')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  noMinRole(@Req() req: Request) {
    return req.tenant;
  }
}

/** Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`). */
describe('SiteAuthorizationGuard (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let userId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule, TenancyModule],
      controllers: [TestSiteController],
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
    await prisma.siteUser.deleteMany({ where: { userId } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'auth009-' } } });
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

  async function createSite(slugSuffix: string): Promise<Site> {
    return prisma.site.create({
      data: {
        slug: `auth009-${slugSuffix}`,
        name: `Auth009 ${slugSuffix}`,
        domain: `auth009-${slugSuffix}.test.com`,
        locale: 'pt-BR',
      },
    });
  }

  it('Site inexistente: 403', async () => {
    const rawToken = await createSessionCookie();

    const response = await request(app!.getHttpServer())
      .get('/test-site/auth009-nao-existe/editor')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });

  it('sem SiteUser: 403', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('sem-membership');

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${site.slug}/editor`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });

  it('SiteUser inativo: 403', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('inativo');
    await prisma.siteUser.create({
      data: { userId, siteId: site.id, role: Role.OWNER, active: false },
    });

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${site.slug}/editor`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });

  it('Role insuficiente (VIEWER numa rota que exige EDITOR): 403', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('role-insuficiente');
    await prisma.siteUser.create({
      data: { userId, siteId: site.id, role: Role.VIEWER, active: true },
    });

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${site.slug}/editor`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });

  it('hierarquia completa: VIEWER falha nas duas rotas; EDITOR passa em EDITOR e falha em OWNER; OWNER passa nas duas', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('hierarquia');

    async function setRole(role: Role): Promise<void> {
      await prisma.siteUser.deleteMany({ where: { userId, siteId: site.id } });
      await prisma.siteUser.create({
        data: { userId, siteId: site.id, role, active: true },
      });
    }

    async function statusFor(path: 'editor' | 'owner'): Promise<number> {
      const response = await request(app!.getHttpServer())
        .get(`/test-site/${site.slug}/${path}`)
        .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);
      return response.status;
    }

    await setRole(Role.VIEWER);
    expect(await statusFor('editor')).toBe(403);
    expect(await statusFor('owner')).toBe(403);

    await setRole(Role.EDITOR);
    expect(await statusFor('editor')).toBe(200);
    expect(await statusFor('owner')).toBe(403);

    await setRole(Role.OWNER);
    expect(await statusFor('editor')).toBe(200);
    expect(await statusFor('owner')).toBe(200);
  });

  it('OWNER no Site A tentando acessar o Site B: 403, mesmo sendo OWNER em A', async () => {
    const rawToken = await createSessionCookie();
    const siteA = await createSite('site-a');
    const siteB = await createSite('site-b');

    await prisma.siteUser.create({
      data: { userId, siteId: siteA.id, role: Role.OWNER, active: true },
    });
    // nenhum SiteUser criado para siteB de propósito.

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${siteB.slug}/editor`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });

  it('sucesso: 200 e anexa request.tenant correto', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('sucesso');
    await prisma.siteUser.create({
      data: { userId, siteId: site.id, role: Role.EDITOR, active: true },
    });

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${site.slug}/editor`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ siteId: site.id, siteSlug: site.slug });
  });

  it('sem autenticação (sem cookie): 401', async () => {
    const site = await createSite('sem-auth');

    const response = await request(app!.getHttpServer()).get(
      `/test-site/${site.slug}/editor`,
    );

    expect(response.status).toBe(401);
  });

  it('guard aplicado sem @MinRole: 403 (falha fechado)', async () => {
    const rawToken = await createSessionCookie();
    const site = await createSite('sem-min-role');
    await prisma.siteUser.create({
      data: { userId, siteId: site.id, role: Role.OWNER, active: true },
    });

    const response = await request(app!.getHttpServer())
      .get(`/test-site/${site.slug}/no-min-role`)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);
  });
});
