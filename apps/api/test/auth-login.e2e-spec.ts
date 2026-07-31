import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import { PrismaService } from '../src/shared/database/prisma.service';

// Lê do `process.env` (populado por `jest-e2e.setup.ts`, a partir do `.env`
// real se existir, senão do fallback fictício `http://localhost:3001`) em
// vez de fixo — mesmo valor que o `OriginGuard` vai ler via `ConfigService`
// dentro da app sob teste. Fixo aqui divergia do `ADMIN_ORIGIN` real sempre
// que o `.env` local define uma porta diferente (ex.: 3000, padrão do
// `next dev` do apps/admin), fazendo o guard rejeitar com 403 requisições
// que deveriam passar.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN ?? 'http://localhost:3001';
const SEED_EMAIL = 'auth005-login@test.com';
const SEED_PASSWORD = 'correct horse battery staple';
const SEED_NAME = 'Auth005 Seed';

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
 * `beforeEach`/`afterEach` (não `beforeAll`) de propósito: cada teste
 * ganha um `TestingModule` novo, e portanto um `RateLimitStore` novo —
 * único jeito de isolar o contador de rate limit entre os testes deste
 * arquivo, já que todos batem na mesma rota a partir do mesmo IP
 * (loopback do supertest), o que os faria compartilhar o mesmo balde de
 * rate limit se o app fosse reaproveitado entre `it`s.
 */
describe('POST /admin/auth/login (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    const repository = moduleFixture.get(PrismaUserRepository);
    const hasher = new Argon2PasswordHasher();
    await repository.create({
      email: SEED_EMAIL,
      passwordHash: await hasher.hash(SEED_PASSWORD),
      name: SEED_NAME,
    });
  });

  afterEach(async () => {
    await prisma.session.deleteMany({
      where: { user: { email: SEED_EMAIL } },
    });
    await prisma.user.deleteMany({ where: { email: SEED_EMAIL } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('credenciais corretas: 200, cookie admin_session presente, corpo sem token', async () => {
    const response = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });

    expect(response.status).toBe(200);

    const cookie = extractCookie(response, ADMIN_SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        email: SEED_EMAIL,
        name: SEED_NAME,
      },
    });
    expect(response.body).not.toHaveProperty('token');
    expect(JSON.stringify(response.body)).not.toContain('token');
  });

  it('sessão persistida contém só o hash, diferente do token bruto do cookie', async () => {
    const response = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });

    const cookie = extractCookie(response, ADMIN_SESSION_COOKIE_NAME)!;
    const rawToken = decodeURIComponent(cookie.split(';')[0].split('=')[1]);

    const session = await prisma.session.findFirst({
      where: { user: { email: SEED_EMAIL } },
    });

    expect(session).not.toBeNull();
    expect(session?.tokenHash).toBeDefined();
    expect(session?.tokenHash).not.toBe(rawToken);
    expect(session?.tokenHash).not.toContain(rawToken);
  });

  it('e-mail inexistente e senha incorreta: mesmo status/mensagem/formato, sem cookie, sem sessão criada', async () => {
    const unknownEmail = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'nao-existe@test.com', password: 'qualquer-coisa' });

    const wrongPassword = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: SEED_EMAIL, password: 'senha-errada' });

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(apiErrorSchema.safeParse(unknownEmail.body).success).toBe(true);

    expect(extractCookie(unknownEmail, ADMIN_SESSION_COOKIE_NAME)).toBeUndefined();
    expect(extractCookie(wrongPassword, ADMIN_SESSION_COOKIE_NAME)).toBeUndefined();

    const sessionCount = await prisma.session.count({
      where: { user: { email: SEED_EMAIL } },
    });
    expect(sessionCount).toBe(0);
  });

  it('rate limit: 5 tentativas aceitas, a 6ª retorna 429', async () => {
    const attempt = () =>
      request(app!.getHttpServer())
        .post('/admin/auth/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email: SEED_EMAIL, password: 'senha-errada' });

    for (let i = 0; i < 5; i++) {
      const response = await attempt();
      expect(response.status).toBe(401);
    }

    const sixth = await attempt();
    expect(sixth.status).toBe(429);
  });
});
