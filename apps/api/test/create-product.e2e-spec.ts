import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { productAdminSchema } from '@commerce-platform/contracts';
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
// usar `!`, mesmo padrão de `create-category.e2e-spec.ts`.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'cat008-user@test.com';

/**
 * `POST /admin/sites/:siteSlug/products` (e2e, CAT-008). Exige Postgres
 * real (mesmo requisito de `database.e2e-spec.ts`).
 */
describe('POST /admin/sites/:siteSlug/products (e2e)', () => {
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
        name: 'Cat008 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'cat008-site-a',
        name: 'Cat008 Site A',
        domain: 'cat008-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat008-site-b',
        name: 'Cat008 Site B',
        domain: 'cat008-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e
    // de Catalog.
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat008-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat008-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'cat008-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat008-' } } });
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

  it('EDITOR cria Produto sem categoryId: 201, categoryId: null, corpo válido contra productAdminSchema', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Fone Bluetooth', slug: 'fone-bluetooth' });

    expect(response.status).toBe(201);
    expect(productAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.categoryId).toBeNull();
    expect(response.body.description).toBeNull();
    expect(response.body.imageUrl).toBeNull();
    expect(response.body.archivedAt).toBeNull();
  });

  it('EDITOR cria Produto com categoryId válido da própria Categoria/Site: 201', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        name: 'Caixa de Som',
        slug: 'caixa-de-som',
        categoryId: category.id,
        description: 'Caixa de som portátil',
        imageUrl: 'https://cdn.test.com/caixa-de-som.jpg',
      });

    expect(response.status).toBe(201);
    expect(productAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.categoryId).toBe(category.id);
    expect(response.body.description).toBe('Caixa de som portátil');
    expect(response.body.imageUrl).toBe('https://cdn.test.com/caixa-de-som.jpg');
  });

  it('slug duplicado no mesmo Site: 409, exatamente um produto persistido', async () => {
    await setRole(siteA, Role.EDITOR);

    const first = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Teclado', slug: 'teclado' });
    expect(first.status).toBe(201);

    const second = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Teclado de novo', slug: 'teclado' });
    expect(second.status).toBe(409);

    const persisted = await prisma.product.findMany({
      where: { siteId: siteA.id, slug: 'teclado' },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.name).toBe('Teclado');
  });

  it('mesmo slug em dois Sites diferentes: os dois criam com sucesso (201)', async () => {
    await setRole(siteA, Role.EDITOR);
    await setRole(siteB, Role.EDITOR);

    const inSiteA = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Mouse', slug: 'mouse' });
    expect(inSiteA.status).toBe(201);

    const inSiteB = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteB.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Mouse', slug: 'mouse' });
    expect(inSiteB.status).toBe(201);

    expect(inSiteA.body.siteId).not.toBe(inSiteB.body.siteId);
  });

  it('categoryId inexistente: 422, nenhum produto persistido', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        name: 'Monitor',
        slug: 'cat008-monitor-categoryid-inexistente',
        categoryId: '00000000-0000-0000-0000-000000000000',
      });

    expect(response.status).toBe(422);

    const persisted = await prisma.product.findMany({
      where: { siteId: siteA.id, slug: 'cat008-monitor-categoryid-inexistente' },
    });
    expect(persisted).toHaveLength(0);
  });

  it('categoryId de Categoria real de outro Site: 422, nenhum produto persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        name: 'Webcam',
        slug: 'cat008-webcam-categoryid-outro-site',
        categoryId: categoryFromSiteB.id,
      });

    expect(response.status).toBe(422);

    const persisted = await prisma.product.findMany({
      where: { siteId: siteA.id, slug: 'cat008-webcam-categoryid-outro-site' },
    });
    expect(persisted).toHaveLength(0);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Headset', slug: 'headset' });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Cabo HDMI', slug: 'cabo-hdmi' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Carregador', slug: 'carregador' });

    expect(response.status).toBe(401);
  });

  it('payload inválido (sem name/slug): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(422);
  });
});
