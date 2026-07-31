import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { SessionAuthGuard } from '../src/modules/identity/presentation/session-auth.guard';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import { TenancyModule } from '../src/modules/tenancy/tenancy.module';
import { SiteAuthorizationGuard } from '../src/modules/tenancy/presentation/site-authorization.guard';
import { MinRole } from '../src/modules/tenancy/presentation/min-role.decorator';
import { PrismaService } from '../src/shared/database/prisma.service';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN` sempre existe.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SEED_EMAIL = 'auth011-no-site@test.com';
const SEED_PASSWORD = 'correct horse battery staple no site';
const SEED_NAME = 'Auth011 Seed';

function extractCookie(
  response: request.Response,
  name: string,
): string | undefined {
  const raw = response.headers['set-cookie'] as string | string[] | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

/**
 * Controller só de teste (mesmo padrão de AUTH-009/AUTH-010): nenhuma rota
 * administrativa real existe ainda — usada aqui só pra provar que a
 * ausência de vínculo é negada de forma controlada (`403` + `apiErrorSchema`),
 * nunca uma exceção não tratada.
 */
@Controller('test-no-site/:siteSlug')
class TestAdminActionController {
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  read() {
    return { ok: true };
  }
}

/**
 * AUTH-011 — usuário sem nenhum Site é um estado válido em todo o sistema,
 * nunca um erro (Architecture.md, Seção 16: "Usuário sem nenhum SiteUser é
 * um estado válido"). Exige Postgres real (mesmo requisito de
 * `database.e2e-spec.ts`).
 *
 * Fluxo único e contínuo de propósito (não dividido em vários `it`s): o
 * critério de aceite da própria tarefa é "nenhuma exceção é lançada **nesse
 * fluxo**" — login real -> `/me` real -> tentativa administrativa, na
 * mesma sessão, do início ao fim.
 */
describe('Usuário sem nenhum Site (e2e — AUTH-011)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let userId: string;
  let siteSlug: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule, TenancyModule],
      controllers: [TestAdminActionController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    const repository = moduleFixture.get(PrismaUserRepository);
    const hasher = new Argon2PasswordHasher();
    const user = await repository.create({
      email: SEED_EMAIL,
      passwordHash: await hasher.hash(SEED_PASSWORD),
      name: SEED_NAME,
    });
    userId = user.id;

    // Site real de fixture, mas SEM nenhum SiteUser para este usuário —
    // prova especificamente "usuário autenticado + Site existente +
    // nenhum vínculo -> 403", não "Site inexistente" (já coberto na
    // AUTH-009).
    const site = await prisma.site.create({
      data: {
        slug: 'auth011-site-sem-vinculo',
        name: 'Auth011 Site Sem Vínculo',
        domain: 'auth011-site-sem-vinculo.test.com',
        locale: 'pt-BR',
      },
    });
    siteSlug = site.slug;
  });

  afterEach(async () => {
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'auth011-' } } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('login bem-sucedido com sessão ativa no banco, /me com sites vazio, e ação administrativa negada de forma controlada', async () => {
    const login = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });

    expect(login.status).toBe(200);
    const cookie = extractCookie(login, ADMIN_SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();

    const session = await prisma.session.findFirst({ where: { userId } });
    expect(session).not.toBeNull();
    expect(session!.revokedAt).toBeNull();

    const rawToken = decodeURIComponent(cookie!.split(';')[0].split('=')[1]);
    const cookieHeader = `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`;

    const me = await request(app!.getHttpServer())
      .get('/admin/auth/me')
      .set('Cookie', cookieHeader);

    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      user: { id: userId, email: SEED_EMAIL, name: SEED_NAME },
      sites: [],
    });

    const adminAction = await request(app!.getHttpServer())
      .get(`/test-no-site/${siteSlug}`)
      .set('Cookie', cookieHeader);

    expect(adminAction.status).toBe(403);
    expect(apiErrorSchema.safeParse(adminAction.body).success).toBe(true);
  });
});
