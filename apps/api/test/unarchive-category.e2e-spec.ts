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

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e de Categoria.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat006-user@test.com';

/**
 * `POST /admin/sites/:siteSlug/categories/:id/unarchive` (e2e, CAT-006).
 * Exige Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('POST /admin/sites/:siteSlug/categories/:id/unarchive (e2e)', () => {
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
        name: 'Cat006 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat006-site-a',
        name: 'Cat006 Site A',
        domain: 'cat006-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat006-site-b',
        name: 'Cat006 Site B',
        domain: 'cat006-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'cat006-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat006-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat006-' } } });
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

  function unarchiveUrl(site: Site, categoryId: string): string {
    return `/admin/sites/${site.slug}/categories/${categoryId}/unarchive`;
  }

  it('OWNER desarquiva Categoria arquivada: 200, archivedAt: null, corpo válido contra categoryAdminSchema', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos', true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(categoryAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(category.id);
    expect(response.body.archivedAt).toBeNull();
  });

  it('idempotente: desarquivar duas vezes mantém archivedAt: null', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'Casa', 'casa', true);

    const first = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
    expect(first.status).toBe(200);
    expect(first.body.archivedAt).toBeNull();

    const second = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
    expect(second.status).toBe(200);
    expect(second.body.archivedAt).toBeNull();
  });

  it('id inexistente no próprio Site: 404, corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, '00000000-0000-0000-0000-000000000000'))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Categoria real de outro Site: 404 (isolamento), corpo válido contra apiErrorSchema', async () => {
    await setRole(siteA, Role.OWNER);
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b', true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, categoryFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: categoryFromSiteB.id },
    });
    expect(persisted.archivedAt).not.toBeNull();
  });

  it('Role insuficiente (EDITOR): 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Esportes', 'esportes', true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'Games', 'games', true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const category = await createCategory(siteA, 'Beleza', 'beleza', true);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, category.id))
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(unarchiveUrl(siteA, 'nao-e-um-uuid'))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(422);
  });
});
