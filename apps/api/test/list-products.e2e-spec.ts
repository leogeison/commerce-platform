import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { listProductsResponseSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão de `list-categories.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat009-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/products` (e2e, CAT-009). Exige Postgres
 * real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('GET /admin/sites/:siteSlug/products (e2e)', () => {
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
        name: 'Cat009 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat009-site-a',
        name: 'Cat009 Site A',
        domain: 'cat009-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat009-site-b',
        name: 'Cat009 Site B',
        domain: 'cat009-site-b.test.com',
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
    // e2e de Catalog.
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat009-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat009-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat009-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat009-' } } });
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

  async function createCategory(site: Site, name: string, slug: string): Promise<Category> {
    return prisma.category.create({ data: { siteId: site.id, name, slug } });
  }

  async function createProduct(
    site: Site,
    name: string,
    slug: string,
    options: { archived?: boolean; categoryId?: string } = {},
  ): Promise<Product> {
    return prisma.product.create({
      data: {
        siteId: site.id,
        name,
        slug,
        categoryId: options.categoryId,
        archivedAt: options.archived ? new Date() : null,
      },
    });
  }

  it('lista vazia: 200, items: [], total: 0, totalPages: 0', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('archived ausente: retorna ativos e arquivados juntos, ordenados por name asc; itens sem offers', async () => {
    await setRole(siteA, Role.VIEWER);
    await createProduct(siteA, 'Zebra', 'zebra');
    await createProduct(siteA, 'Abacaxi', 'abacaxi', { archived: true });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listProductsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Abacaxi',
      'Zebra',
    ]);
    for (const item of response.body.items) {
      expect(item.offers).toBeUndefined();
    }
  });

  it('archived=true: só arquivados', async () => {
    await setRole(siteA, Role.VIEWER);
    await createProduct(siteA, 'Ativo', 'ativo');
    const archived = await createProduct(siteA, 'Arquivado', 'arquivado', { archived: true });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ archived: 'true' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(archived.id);
  });

  it('archived=false: só ativos', async () => {
    await setRole(siteA, Role.VIEWER);
    const active = await createProduct(siteA, 'Ativo', 'ativo');
    await createProduct(siteA, 'Arquivado', 'arquivado', { archived: true });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ archived: 'false' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(active.id);
  });

  it('categoryId: filtra só produtos daquela Categoria', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos');
    const inCategory = await createProduct(siteA, 'Fone', 'fone', {
      categoryId: category.id,
    });
    await createProduct(siteA, 'Sem categoria', 'sem-categoria');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ categoryId: category.id })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(inCategory.id);
  });

  it('categoryId válido, mas de outra Categoria de outro Site: 200, lista vazia (não erro)', async () => {
    await setRole(siteA, Role.VIEWER);
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b');
    await createProduct(siteA, 'Produto A', 'produto-a');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ categoryId: categoryFromSiteB.id })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await setRole(siteA, Role.VIEWER);
    await createProduct(siteA, 'Produto A', 'produto-a');
    await createProduct(siteA, 'Produto B', 'produto-b');
    await createProduct(siteA, 'Produto C', 'produto-c');

    const firstPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ page: 1, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ page: 3, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('isolamento básico: Site A não vê produtos do Site B', async () => {
    await setRole(siteA, Role.VIEWER);
    await createProduct(siteA, 'Do Site A', 'do-site-a');
    await createProduct(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Do Site A');
  });

  it('VIEWER consegue listar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/products`,
    );

    expect(response.status).toBe(401);
  });

  it('page=0: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ page: 0 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ pageSize: 101 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('archived com valor inválido (nem "true" nem "false"): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ archived: 'maybe' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('categoryId com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/products`)
      .query({ categoryId: 'nao-e-um-uuid' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
