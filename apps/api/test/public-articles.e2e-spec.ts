import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { listPublicArticlesResponseSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType } from '../src/generated/prisma/enums';
import type { Article, Category, Site } from '../src/generated/prisma/client';

/**
 * `GET /public/sites/:siteSlug/articles` (e2e, PUB-002). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 */
describe('GET /public/sites/:siteSlug/articles (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'pub002-site-a',
        name: 'Pub002 Site A',
        domain: 'pub002-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'pub002-site-b',
        name: 'Pub002 Site B',
        domain: 'pub002-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'pub002-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'pub002-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'pub002-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createCategory(site: Site, slug: string): Promise<Category> {
    return prisma.category.create({
      data: { siteId: site.id, name: `Categoria ${slug}`, slug },
    });
  }

  async function createPublishedArticle(
    site: Site,
    slug: string,
    category: Category,
    overrides: Partial<{ type: ArticleType; publishedAt: Date }> = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: overrides.type ?? ArticleType.REVIEW,
        status: 'PUBLISHED',
        categoryId: category.id,
        publishedAt: overrides.publishedAt ?? new Date(),
      },
    });
  }

  async function createNonPublishedArticle(
    site: Site,
    slug: string,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'ARCHIVED',
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status,
      },
    });
  }

  it('lista vazia: 200, envelope paginado completo e válido contra listPublicArticlesResponseSchema', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles`,
    );

    expect(response.status).toBe(200);
    expect(listPublicArticlesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('só Artigos PUBLISHED aparecem; DRAFT/PENDING_REVIEW/ARCHIVED nunca aparecem', async () => {
    const category = await createCategory(siteA, 'categoria-status');
    await createPublishedArticle(siteA, 'publicado', category);
    await createNonPublishedArticle(siteA, 'rascunho', 'DRAFT');
    await createNonPublishedArticle(siteA, 'em-revisao', 'PENDING_REVIEW');
    await createNonPublishedArticle(siteA, 'arquivado', 'ARCHIVED');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles`,
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('publicado');
  });

  it('cada item inclui categorySlug correto e não expõe bodyMdx/status/siteId/authorId', async () => {
    const category = await createCategory(siteA, 'categoria-presenter');
    await createPublishedArticle(siteA, 'com-categoria', category);

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0].categorySlug).toBe('categoria-presenter');
    expect(response.body.items[0]).not.toHaveProperty('bodyMdx');
    expect(response.body.items[0]).not.toHaveProperty('status');
    expect(response.body.items[0]).not.toHaveProperty('siteId');
    expect(response.body.items[0]).not.toHaveProperty('authorId');
  });

  it('isolamento cross-site: consultando com siteSlug do Site A, Artigos do Site B nunca aparecem', async () => {
    const categoryA = await createCategory(siteA, 'categoria-a');
    const categoryB = await createCategory(siteB, 'categoria-b');
    await createPublishedArticle(siteA, 'do-site-a', categoryA);
    await createPublishedArticle(siteB, 'do-site-b', categoryB);

    const responseA = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles`,
    );
    expect(responseA.status).toBe(200);
    expect(responseA.body.total).toBe(1);
    expect(responseA.body.items[0].slug).toBe('do-site-a');

    const responseB = await request(app!.getHttpServer()).get(
      `/public/sites/${siteB.slug}/articles`,
    );
    expect(responseB.status).toBe(200);
    expect(responseB.body.total).toBe(1);
    expect(responseB.body.items[0].slug).toBe('do-site-b');
  });

  it('filtro categorySlug: devolve só os Artigos daquela Categoria', async () => {
    const category = await createCategory(siteA, 'categoria-filtro');
    const outraCategoria = await createCategory(siteA, 'categoria-outra');
    await createPublishedArticle(siteA, 'com-categoria', category);
    await createPublishedArticle(siteA, 'com-outra-categoria', outraCategoria);

    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ categorySlug: 'categoria-filtro' });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('com-categoria');
  });

  it('filtro type: devolve só os Artigos com o type pedido', async () => {
    const category = await createCategory(siteA, 'categoria-type');
    await createPublishedArticle(siteA, 'review', category, { type: ArticleType.REVIEW });
    await createPublishedArticle(siteA, 'comparacao', category, {
      type: ArticleType.COMPARISON,
    });

    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ type: 'COMPARISON' });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('comparacao');
  });

  it('categorySlug + type combinados: aplica interseção (AND), não filtros independentes', async () => {
    const category = await createCategory(siteA, 'categoria-combinada');
    const outraCategoria = await createCategory(siteA, 'categoria-combinada-outra');
    await createPublishedArticle(siteA, 'bate-tudo', category, { type: ArticleType.DEAL });
    await createPublishedArticle(siteA, 'so-categoria-bate', category, {
      type: ArticleType.REVIEW,
    });
    await createPublishedArticle(siteA, 'so-type-bate', outraCategoria, {
      type: ArticleType.DEAL,
    });

    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ categorySlug: 'categoria-combinada', type: 'DEAL' });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('bate-tudo');
  });

  it('ordenação: publishedAt desc, com id asc como desempate para publishedAt igual', async () => {
    const category = await createCategory(siteA, 'categoria-ordenacao');
    const olderDate = new Date('2026-01-01T00:00:00.000Z');
    const sameDate = new Date('2026-02-01T00:00:00.000Z');
    const newerDate = new Date('2026-03-01T00:00:00.000Z');

    const older = await createPublishedArticle(siteA, 'mais-antigo', category, {
      publishedAt: olderDate,
    });
    const newer = await createPublishedArticle(siteA, 'mais-novo', category, {
      publishedAt: newerDate,
    });
    // Dois Artigos com o mesmo `publishedAt`, para comprovar o desempate
    // estável por `id asc` — nomes de slug embaralhados de propósito para
    // não coincidir com a ordem de criação/id.
    const tieCandidates = await Promise.all([
      createPublishedArticle(siteA, 'empate-um', category, { publishedAt: sameDate }),
      createPublishedArticle(siteA, 'empate-dois', category, { publishedAt: sameDate }),
    ]);
    const [tieFirstById, tieSecondById] = [...tieCandidates].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      newer.id,
      tieFirstById.id,
      tieSecondById.id,
      older.id,
    ]);
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    const category = await createCategory(siteA, 'categoria-paginacao');
    await createPublishedArticle(siteA, 'artigo-a', category);
    await createPublishedArticle(siteA, 'artigo-b', category);
    await createPublishedArticle(siteA, 'artigo-c', category);

    const firstPage = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ page: 1, pageSize: 2 });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ page: 3, pageSize: 2 });

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('siteSlug inexistente: 404', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/public/sites/pub002-site-inexistente/articles',
    );

    expect(response.status).toBe(404);
  });

  it('page=0: 422', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ page: 0 });

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/articles`)
      .query({ pageSize: 101 });

    expect(response.status).toBe(422);
  });
});
