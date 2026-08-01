import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { listCategoriesResponseSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Category, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão de `create-category.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat002-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/categories` (e2e, CAT-002). Exige Postgres
 * real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/categories (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Cat002 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat002-site-a',
        name: 'Cat002 Site A',
        domain: 'cat002-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat002-site-b',
        name: 'Cat002 Site B',
        domain: 'cat002-site-b.test.com',
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
    // `create-category.e2e-spec.ts`/`site-isolation.e2e-spec.ts`.
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat002-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat002-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat002-' } } });
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

  async function createCategory(
    site: Site,
    name: string,
    slug: string,
    archived = false,
  ): Promise<Category> {
    return prisma.category.create({
      data: {
        siteId: site.id,
        name,
        slug,
        archivedAt: archived ? new Date() : null,
      },
    });
  }

  it('lista vazia: 200, items: [], total: 0, totalPages: 0', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listCategoriesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('archived ausente: retorna ativas e arquivadas juntas, ordenadas por name asc', async () => {
    await setRole(siteA, Role.VIEWER);
    await createCategory(siteA, 'Zebra', 'zebra');
    await createCategory(siteA, 'Abacaxi', 'abacaxi', true);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Abacaxi',
      'Zebra',
    ]);
  });

  it('archived=true: só arquivadas', async () => {
    await setRole(siteA, Role.VIEWER);
    await createCategory(siteA, 'Ativa', 'ativa', false);
    const archived = await createCategory(siteA, 'Arquivada', 'arquivada', true);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ archived: 'true' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(archived.id);
    expect(response.body.items[0].archivedAt).not.toBeNull();
  });

  it('archived=false: só ativas', async () => {
    await setRole(siteA, Role.VIEWER);
    const active = await createCategory(siteA, 'Ativa', 'ativa', false);
    await createCategory(siteA, 'Arquivada', 'arquivada', true);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ archived: 'false' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(active.id);
    expect(response.body.items[0].archivedAt).toBeNull();
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await setRole(siteA, Role.VIEWER);
    await createCategory(siteA, 'Categoria A', 'categoria-a');
    await createCategory(siteA, 'Categoria B', 'categoria-b');
    await createCategory(siteA, 'Categoria C', 'categoria-c');

    const firstPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ page: 1, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);
    expect(firstPage.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Categoria A',
      'Categoria B',
    ]);

    const secondPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ page: 2, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].name).toBe('Categoria C');

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ page: 3, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('isolamento básico: Site A não vê categorias do Site B', async () => {
    await setRole(siteA, Role.VIEWER);
    await createCategory(siteA, 'Do Site A', 'do-site-a');
    await createCategory(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Do Site A');
  });

  it('VIEWER consegue listar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/categories`,
    );

    expect(response.status).toBe(401);
  });

  it('page=0: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ page: 0 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ pageSize: 101 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('archived com valor inválido (nem "true" nem "false"): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories`)
      .query({ archived: 'maybe' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
