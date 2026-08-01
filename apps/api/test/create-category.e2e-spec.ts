import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { categoryAdminSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
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
// usar `!`, mesmo padrão de `site-isolation.e2e-spec.ts`.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat001-user@test.com';

/**
 * `POST /admin/sites/:siteSlug/categories` (e2e, CAT-001). Exige Postgres
 * real (mesmo requisito de `database.e2e-spec.ts`) — monta `CatalogModule`
 * real (não um controller de teste), já que `CategoriesController` é
 * produção.
 */
describe('POST /admin/sites/:siteSlug/categories (e2e)', () => {
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
        name: 'Cat001 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat001-site-a',
        name: 'Cat001 Site A',
        domain: 'cat001-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat001-site-b',
        name: 'Cat001 Site B',
        domain: 'cat001-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado de
    // `site-isolation.e2e-spec.ts` para não mascarar o erro original com um
    // `TypeError` sem relação.
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat001-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat001-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat001-' } } });
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

  it('EDITOR cria Categoria: 201, corpo válido contra categoryAdminSchema, siteId correto', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Eletrônicos', slug: 'eletronicos' });

    expect(response.status).toBe(201);

    const parsed = categoryAdminSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.name).toBe('Eletrônicos');
    expect(response.body.slug).toBe('eletronicos');
    expect(response.body.archivedAt).toBeNull();
  });

  it('OWNER também cria Categoria: 201', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Casa', slug: 'casa' });

    expect(response.status).toBe(201);
  });

  it('slug duplicado no mesmo Site: 409, exatamente uma categoria persistida', async () => {
    await setRole(siteA, Role.EDITOR);

    const first = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Moda', slug: 'moda' });
    expect(first.status).toBe(201);

    const second = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Moda de novo', slug: 'moda' });
    expect(second.status).toBe(409);

    const persisted = await prisma.category.findMany({
      where: { siteId: siteA.id, slug: 'moda' },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.name).toBe('Moda');
  });

  it('mesmo slug em dois Sites diferentes: os dois criam com sucesso (201)', async () => {
    await setRole(siteA, Role.EDITOR);
    await setRole(siteB, Role.EDITOR);

    const inSiteA = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Livros', slug: 'livros' });
    expect(inSiteA.status).toBe(201);

    const inSiteB = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteB.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Livros', slug: 'livros' });
    expect(inSiteB.status).toBe(201);

    expect(inSiteA.body.siteId).not.toBe(inSiteB.body.siteId);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Esportes', slug: 'esportes' });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Games', slug: 'games' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Beleza', slug: 'beleza' });

    expect(response.status).toBe(401);
  });

  it('payload inválido (sem name/slug): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/categories`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(422);
  });
});
