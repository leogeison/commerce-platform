import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { listArticlesResponseSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Category, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `SESSION_SECRET` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`,
// mesmo padrão de `list-authors.e2e-spec.ts`.
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt007-user@test.com';

/**
 * `GET /admin/sites/:siteSlug/articles` (e2e, EDT-007). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 */
describe('GET /admin/sites/:siteSlug/articles (e2e)', () => {
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
        name: 'Edt007 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt007-site-a',
        name: 'Edt007 Site A',
        domain: 'edt007-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt007-site-b',
        name: 'Edt007 Site B',
        domain: 'edt007-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e.
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt007-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'edt007-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt007-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt007-' } } });
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

  async function createCategory(site: Site, slug: string): Promise<Category> {
    return prisma.category.create({
      data: { siteId: site.id, name: `Categoria ${slug}`, slug },
    });
  }

  async function createArticle(
    site: Site,
    slug: string,
    overrides: Partial<{
      type: ArticleType;
      status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
      categoryId: string;
    }> = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: overrides.type ?? ArticleType.REVIEW,
        status: overrides.status ?? 'DRAFT',
        categoryId: overrides.categoryId,
      },
    });
  }

  it('lista vazia: 200, envelope paginado completo e válido contra listArticlesResponseSchema', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listArticlesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('sem filtro: devolve todos os Artigos do Site, ordenados por createdAt desc (id asc como desempate), sem bodyMdx', async () => {
    await setRole(siteA, Role.VIEWER);
    const first = await createArticle(siteA, 'primeiro-criado');
    // Espera mínima para garantir `createdAt` estritamente crescente entre
    // os dois Artigos, evitando depender de resolução de timestamp abaixo
    // do milissegundo do Postgres.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createArticle(siteA, 'segundo-criado');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listArticlesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(response.body.items[0]).not.toHaveProperty('bodyMdx');
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await setRole(siteA, Role.VIEWER);
    await createArticle(siteA, 'artigo-a');
    await createArticle(siteA, 'artigo-b');
    await createArticle(siteA, 'artigo-c');

    const firstPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ page: 1, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);

    const secondPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ page: 2, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ page: 3, pageSize: 2 })
      .set('Cookie', cookieHeader());

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('isolamento: Artigos de outro Site não aparecem na listagem', async () => {
    await setRole(siteA, Role.VIEWER);
    await createArticle(siteA, 'do-site-a');
    await createArticle(siteB, 'do-site-b');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('do-site-a');
  });

  it('filtro status: devolve só os Artigos com o status pedido', async () => {
    await setRole(siteA, Role.VIEWER);
    await createArticle(siteA, 'rascunho', { status: 'DRAFT' });
    await createArticle(siteA, 'publicado', { status: 'PUBLISHED' });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ status: 'PUBLISHED' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('publicado');
  });

  it('filtro type: devolve só os Artigos com o type pedido', async () => {
    await setRole(siteA, Role.VIEWER);
    await createArticle(siteA, 'review', { type: ArticleType.REVIEW });
    await createArticle(siteA, 'comparacao', { type: ArticleType.COMPARISON });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ type: 'COMPARISON' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('comparacao');
  });

  it('filtro categoryId: devolve só os Artigos daquela Categoria', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'categoria-filtro');
    await createArticle(siteA, 'com-categoria', { categoryId: category.id });
    await createArticle(siteA, 'sem-categoria');

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ categoryId: category.id })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('com-categoria');
  });

  it('os três filtros combinados simultaneamente: aplica AND entre status, type e categoryId', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'categoria-combinada');
    await createArticle(siteA, 'bate-tudo', {
      status: 'PUBLISHED',
      type: ArticleType.DEAL,
      categoryId: category.id,
    });
    await createArticle(siteA, 'so-categoria-bate', {
      status: 'DRAFT',
      type: ArticleType.DEAL,
      categoryId: category.id,
    });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ status: 'PUBLISHED', type: 'DEAL', categoryId: category.id })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('bate-tudo');
  });

  it('VIEWER consegue listar (Role mínima): 200', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer()).get(
      `/admin/sites/${siteA.slug}/articles`,
    );

    expect(response.status).toBe(401);
  });

  it('page=0: 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ page: 0 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ pageSize: 101 })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });

  // --- UXA-017: `orderBy` (exposição HTTP da UXF-012) ---

  it('status=DRAFT + orderBy=updatedAt_desc: ordena por updatedAt desc real, não por createdAt (prova e2e de ponta a ponta até ListArticlesUseCase)', async () => {
    await setRole(siteA, Role.VIEWER);
    const first = await createArticle(siteA, 'draft-criado-primeiro', { status: 'DRAFT' });
    // Mesma espera mínima já usada no teste de ordenação default acima —
    // garante `createdAt` estritamente crescente entre os dois.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createArticle(siteA, 'draft-criado-segundo', { status: 'DRAFT' });
    await createArticle(siteA, 'publicado-fora-do-filtro-status', { status: 'PUBLISHED' });

    // Toca `first` por último, depois de `second` já existir — `updatedAt`
    // de `first` fica mais recente que o de `second`, mesmo `first` tendo
    // sido criado antes. Se a ordenação observada fosse por `createdAt`
    // (o default que `orderBy=updatedAt_desc` precisa efetivamente
    // substituir, não só aceitar no schema), a ordem seria [second, first]
    // — o oposto do que este teste comprova.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.article.update({
      where: { id: first.id },
      data: { title: 'Artigo draft-criado-primeiro (editado)' },
    });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ status: 'DRAFT', orderBy: 'updatedAt_desc' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(listArticlesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([first.id, second.id]);
  });

  it('sem orderBy: comportamento default (createdAt desc) preservado, mesmo com status=DRAFT aplicado', async () => {
    await setRole(siteA, Role.VIEWER);
    const first = await createArticle(siteA, 'draft-default-primeiro', { status: 'DRAFT' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createArticle(siteA, 'draft-default-segundo', { status: 'DRAFT' });

    // Mesmo touch de `first` do teste anterior — se a omissão de `orderBy`
    // vazasse `updatedAt desc` por engano, a ordem observada aqui seria
    // [first, second], não [second, first].
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.article.update({
      where: { id: first.id },
      data: { title: 'Artigo draft-default-primeiro (editado)' },
    });

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ status: 'DRAFT' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
  });

  it('orderBy inválido (fora do enum fechado createdAt_desc|updatedAt_desc): 422', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/articles`)
      .query({ orderBy: 'title_asc' })
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(422);
  });
});
