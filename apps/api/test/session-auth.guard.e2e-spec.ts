import { Controller, Get, INestApplication, Req, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { SessionAuthGuard } from '../src/modules/identity/presentation/session-auth.guard';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import { generateSessionToken, hashSessionToken } from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';

const SEED_EMAIL = 'auth006-guard@test.com';
const SEED_NAME = 'Auth006 Seed';
// `jest-e2e.setup.ts` garante um valor sempre presente (real do `.env` ou o
// fallback fictício) — precisamos do valor bruto aqui, fora da injeção de
// dependência do Nest, para computar o mesmo hash HMAC que o próprio
// `SessionAuthGuard` vai calcular dentro da aplicação sob teste.
const SESSION_SECRET = process.env.SESSION_SECRET!;

/**
 * Controller só de teste, mesmo padrão de `TestErrorsController`
 * (`all-exceptions-filter.e2e-spec.ts`): existe apenas para exercitar
 * `SessionAuthGuard` numa rota HTTP real — nenhuma rota protegida de
 * verdade existe ainda nesta fase (AUTH-007/008/009 são as primeiras).
 */
@Controller('test-protected')
class TestProtectedController {
  @Get()
  @UseGuards(SessionAuthGuard)
  get(@Req() req: Request) {
    return req.auth;
  }
}

/**
 * Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * `app.use(cookieParser())` explícito aqui: o `TestingModule` cria a
 * aplicação diretamente (`createNestApplication()`), sem passar por
 * `bootstrap()` de `main.ts` — precisa do mesmo middleware que a API real
 * registra lá, senão `request.cookies` fica sempre `undefined`.
 */
describe('SessionAuthGuard (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let userId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule],
      controllers: [TestProtectedController],
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
    // Session antes de User: FK de Session -> User (mesmo que o `onDelete:
    // Cascade` do schema resolvesse sozinho, a ordem explícita não depende
    // dessa configuração para funcionar).
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  /** Cria uma Session de fixture e devolve o token BRUTO correspondente. */
  async function createSession(
    overrides: { expiresAt?: Date; revokedAt?: Date | null } = {},
  ): Promise<string> {
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);

    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
        revokedAt: overrides.revokedAt ?? null,
      },
    });

    return rawToken;
  }

  it('sem cookie: 401', async () => {
    const response = await request(app!.getHttpServer()).get('/test-protected');

    expect(response.status).toBe(401);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('token desconhecido: 401, mesmo status/mensagem/formato de sem cookie', async () => {
    const noCookie = await request(app!.getHttpServer()).get('/test-protected');
    const unknownToken = await request(app!.getHttpServer())
      .get('/test-protected')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=token-que-nao-existe`);

    expect(unknownToken.status).toBe(401);
    expect(unknownToken.body).toEqual(noCookie.body);
  });

  it('sessão expirada: 401, mesmo status/mensagem/formato de sem cookie', async () => {
    const noCookie = await request(app!.getHttpServer()).get('/test-protected');
    const rawToken = await createSession({ expiresAt: new Date(Date.now() - 1000) });

    const expired = await request(app!.getHttpServer())
      .get('/test-protected')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(expired.status).toBe(401);
    expect(expired.body).toEqual(noCookie.body);
  });

  it('sessão revogada: 401, mesmo status/mensagem/formato de sem cookie', async () => {
    const noCookie = await request(app!.getHttpServer()).get('/test-protected');
    const rawToken = await createSession({ revokedAt: new Date() });

    const revoked = await request(app!.getHttpServer())
      .get('/test-protected')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(revoked.status).toBe(401);
    expect(revoked.body).toEqual(noCookie.body);
  });

  it('sessão válida: 200, user e sessionId corretos, sem passwordHash/tokenHash/token bruto no corpo', async () => {
    const rawToken = await createSession();

    const response = await request(app!.getHttpServer())
      .get('/test-protected')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(200);

    const session = await prisma.session.findFirst({ where: { userId } });
    expect(session).not.toBeNull();

    expect(response.body).toEqual({
      user: { id: userId, email: SEED_EMAIL, name: SEED_NAME },
      sessionId: session!.id,
    });

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain(rawToken);
  });
});
