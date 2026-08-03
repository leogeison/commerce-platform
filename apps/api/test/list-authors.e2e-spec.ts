import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { listAuthorsResponseSchema } from '@commerce-platform/contracts';
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
// mesmo padrão de `list-categories.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt002-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/authors` (e2e, EDT-002). Exige Postgres real
 * (mesmo requisito de `create-author.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/authors (e2e)', () => {
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
        name: 'Edt002 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt002-site-a',
        name: 'Edt002 Site A',
        domain: 'edt002-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt002-site-b',
        name: 'Edt002 Site B',
        domain: 'edt002-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado em
    // `create-author.e2e-spec.ts`/`list-categories.e2e-spec.ts`.
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt002-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt002-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt002-' } } });
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

  it('lista vazia: 200, envelope paginado completo e válido contra listAuthorsResponseSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listAuthorsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('sem filtro: devolve todos os Authors do Site, ordenados por name asc, envelope válido', async () => {
    await setRole(siteA, Role.VIEWER);
    await createAuthor(siteA, 'Zebra');
    await createAuthor(siteA, 'Abacaxi');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listAuthorsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Abacaxi',
      'Zebra',
    ]);
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await setRole(siteA, Role.VIEWER);
    await createAuthor(siteA, 'Autor A');
    await createAuthor(siteA, 'Autor B');
    await createAuthor(siteA, 'Autor C');

    const firstPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .query({ page: 1, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(firstPage.status).toBe(200);
    expect(listAuthorsResponseSchema.safeParse(firstPage.body).success).toBe(true);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);
    expect(firstPage.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Autor A',
      'Autor B',
    ]);

    const secondPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .query({ page: 2, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].name).toBe('Autor C');

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .query({ page: 3, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('isolamento: Authors de outro Site não aparecem na listagem', async () => {
    await setRole(siteA, Role.VIEWER);
    await createAuthor(siteA, 'Do Site A');
    await createAuthor(siteB, 'Do Site B');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe('Do Site A');
  });

  it('VIEWER consegue listar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/authors`,
    );

    expect(response.status).toBe(401);
  });

  it('page=0: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .query({ page: 0 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/authors`)
      .query({ pageSize: 101 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
