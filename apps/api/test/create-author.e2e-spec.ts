import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { authorAdminSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão de `create-category.e2e-spec.ts`.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const ACTING_USER_EMAIL = 'edt001-acting-user@test.com';
const TARGET_USER_EMAIL = 'edt001-target-user@test.com';
const NONEXISTENT_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/authors` (e2e, EDT-001). Exige Postgres
 * real (mesmo requisito de `create-category.e2e-spec.ts`) — monta
 * `EditorialModule` real (não um controller de teste), já que
 * `AuthorsController` é produção.
 *
 * Dois usuários distintos: `actingUser` autentica e chama a API (recebe
 * `SiteUser` nos testes que precisam de Role); `targetUser` é apenas o
 * `userId` referenciado no corpo de alguns testes — nunca autentica, e
 * deliberadamente **nunca recebe nenhum `SiteUser`**, em nenhum Site, para
 * provar que a associação `Author.userId` não exige vínculo de acesso
 * (decisão explícita desta tarefa, ver `create-author-request.ts`).
 */
describe('POST /admin/sites/:siteSlug/authors (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let actingUser: User | undefined;
  let targetUser: User | undefined;
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

    actingUser = await prisma.user.create({
      data: {
        email: ACTING_USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Edt001 Acting User',
      },
    });

    targetUser = await prisma.user.create({
      data: {
        email: TARGET_USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Edt001 Target User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt001-site-a',
        name: 'Edt001 Site A',
        domain: 'edt001-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt001-site-b',
        name: 'Edt001 Site B',
        domain: 'edt001-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: actingUser.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    // `actingUser`/`targetUser` podem nunca ter sido atribuídos se o
    // `beforeEach` falhar antes (ex.: Postgres indisponível) — mesmo
    // cuidado de `create-category.e2e-spec.ts` para não mascarar o erro
    // original com um `TypeError` sem relação.
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt001-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt001-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt001-' } } });
    if (actingUser?.id) {
      await prisma.session.deleteMany({ where: { userId: actingUser.id } });
      await prisma.user.deleteMany({ where: { id: actingUser.id } });
    }
    if (targetUser?.id) {
      await prisma.user.deleteMany({ where: { id: targetUser.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role): Promise<void> {
    await prisma.siteUser.deleteMany({ where: { userId: actingUser!.id, siteId: site.id } });
    await prisma.siteUser.create({
      data: { userId: actingUser!.id, siteId: site.id, role, active: true },
    });
  }

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  it('EDITOR cria Author sem userId: 201, corpo válido contra authorAdminSchema, siteId correto, userId null', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Convidado', bio: 'Bio de teste' });

    expect(response.status).toBe(201);

    const parsed = authorAdminSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.name).toBe('Autor Convidado');
    expect(response.body.userId).toBeNull();
  });

  it('userId de um User sem nenhum SiteUser neste Site (nem em nenhum outro): 201, Author fica associado mesmo sem vínculo de acesso', async () => {
    await setRole(siteA, Role.EDITOR);

    const membership = await prisma.siteUser.findFirst({
      where: { userId: targetUser!.id },
    });
    expect(membership).toBeNull();

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Vinculado', userId: targetUser!.id });

    expect(response.status).toBe(201);
    expect(response.body.userId).toBe(targetUser!.id);
  });

  it('OWNER também cria Author (sem userId): 201', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Owner' });

    expect(response.status).toBe(201);
  });

  it('userId duplicado no mesmo Site: 409, exatamente um Author persistido com esse userId', async () => {
    await setRole(siteA, Role.EDITOR);

    const first = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Primeiro Perfil', userId: targetUser!.id });
    expect(first.status).toBe(201);

    const second = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Segundo Perfil', userId: targetUser!.id });
    expect(second.status).toBe(409);

    const persisted = await prisma.author.findMany({
      where: { siteId: siteA.id, userId: targetUser!.id },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.name).toBe('Primeiro Perfil');
  });

  it('mesmo userId em dois Sites diferentes: os dois criam com sucesso (201)', async () => {
    await setRole(siteA, Role.EDITOR);
    await setRole(siteB, Role.EDITOR);

    const inSiteA = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Perfil Site A', userId: targetUser!.id });
    expect(inSiteA.status).toBe(201);

    const inSiteB = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteB.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Perfil Site B', userId: targetUser!.id });
    expect(inSiteB.status).toBe(201);

    expect(inSiteA.body.siteId).not.toBe(inSiteB.body.siteId);
    expect(inSiteA.body.userId).toBe(targetUser!.id);
    expect(inSiteB.body.userId).toBe(targetUser!.id);
  });

  it('userId com UUID válido mas inexistente: 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Órfão', userId: NONEXISTENT_USER_ID });

    expect(response.status).toBe(422);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Sem Permissão' });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Autor Origem Inválida' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autor Sem Sessão' });

    expect(response.status).toBe(401);
  });

  it('payload inválido (sem name): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(422);
  });
});
