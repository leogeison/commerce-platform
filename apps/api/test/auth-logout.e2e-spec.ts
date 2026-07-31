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

// Lê do `process.env` (populado por `jest-e2e.setup.ts`) em vez de fixo —
// mesma correção já aplicada em `auth-login.e2e-spec.ts` e
// `origin-guard.e2e-spec.ts` (ver commit da AUTH-006), pra não reintroduzir
// o mesmo bug de divergência com o `ADMIN_ORIGIN` real do `.env` local.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN ?? 'http://localhost:3001';
const SEED_EMAIL = 'auth007-logout@test.com';
const SEED_NAME = 'Auth007 Seed';
const SESSION_SECRET = process.env.SESSION_SECRET!;

function extractCookie(
  response: request.Response,
  name: string,
): string | undefined {
  const raw = response.headers['set-cookie'] as string | string[] | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

/**
 * Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * `app.use(cookieParser())` explícito: `SessionAuthGuard` (AUTH-006), que
 * também protege o logout, depende de `request.cookies` populado — mesma
 * necessidade já documentada em `session-auth.guard.e2e-spec.ts`.
 */
describe('POST /admin/auth/logout (e2e)', () => {
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
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  /** Cria uma Session de fixture (ativa, não expirada) e devolve o token BRUTO + id. */
  async function createSession(): Promise<{ rawToken: string; sessionId: string }> {
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);

    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    return { rawToken, sessionId: session.id };
  }

  it('cookie válido + origem válida: 204 sem corpo, cookie limpo, sessão revogada no banco', async () => {
    const { rawToken, sessionId } = await createSession();

    const response = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.body).toEqual({});

    const cookie = extractCookie(response, ADMIN_SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  it('reutilizar o mesmo cookie após logout: 401 (sessão revogada não autentica mais)', async () => {
    const { rawToken } = await createSession();

    const first = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);
    expect(first.status).toBe(204);

    const second = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(second.status).toBe(401);
  });

  it('origem ausente: 403, sessão permanece ativa', async () => {
    const { rawToken, sessionId } = await createSession();

    const response = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.revokedAt).toBeNull();
  });

  it('origem inválida (cross-site): 403, sessão permanece ativa', async () => {
    const { rawToken, sessionId } = await createSession();

    const response = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', 'http://evil.example.com')
      .set('Cookie', `${ADMIN_SESSION_COOKIE_NAME}=${rawToken}`);

    expect(response.status).toBe(403);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.revokedAt).toBeNull();
  });

  it('cookie ausente com origem válida: 401', async () => {
    const response = await request(app!.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });
});
