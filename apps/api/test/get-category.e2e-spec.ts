import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, categoryAdminSchema } from '@commerce-platform/contracts';
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
// mesmo padrão de `create-category.e2e-spec.ts`/`list-categories.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat003-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/categories/:id` (e2e, CAT-003). Exige
 * Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/categories/:id (e2e)', () => {
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
        name: 'Cat003 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat003-site-a',
        name: 'Cat003 Site A',
        domain: 'cat003-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat003-site-b',
        name: 'Cat003 Site B',
        domain: 'cat003-site-b.test.com',
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
    // e2e de Categoria.
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat003-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat003-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat003-' } } });
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

  it('sucesso: 200, corpo válido contra categoryAdminSchema', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/${category.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(categoryAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(category.id);
    expect(response.body.siteId).toBe(siteA.id);
  });

  it('categoria arquivada: 200 (arquivamento não é filtro de visibilidade no detalhe)', async () => {
    await setRole(siteA, Role.VIEWER);
    const archived = await createCategory(siteA, 'Arquivada', 'arquivada', true);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/${archived.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.archivedAt).not.toBeNull();
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Categoria real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.VIEWER);
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/${categoryFromSiteB.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/nao-e-um-uuid`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('VIEWER consegue detalhar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'Casa', 'casa');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/${category.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'Moda', 'moda');

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/categories/${category.id}`,
    );

    expect(response.status).toBe(401);
  });
});
