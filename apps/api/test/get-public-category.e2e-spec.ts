import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { publicArticleSchema, publicCategorySchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType } from '../src/generated/prisma/enums';
import type { Category, Site } from '../src/generated/prisma/client';

/**
 * `GET /public/sites/:siteSlug/categories/:slug` (e2e, PUB-004). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto).
 *
 * Importa `CatalogModule` **e** `EditorialModule`: a rota testada é só do
 * `CatalogModule`, mas o teste de consistência com `categorySlug` (último
 * `it`) também bate em `GET /public/sites/:siteSlug/articles/:slug`
 * (`EditorialModule`) na mesma instância da aplicação — evita rodar dois
 * `TestingModule` separados só para uma asserção cruzada.
 */
describe('GET /public/sites/:siteSlug/categories/:slug (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CatalogModule, EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'pub004-site-a',
        name: 'Pub004 Site A',
        domain: 'pub004-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'pub004-site-b',
        name: 'Pub004 Site B',
        domain: 'pub004-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'pub004-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'pub004-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'pub004-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createCategory(
    site: Site,
    slug: string,
    overrides: Partial<{ archived: boolean }> = {},
  ): Promise<Category> {
    return prisma.category.create({
      data: {
        siteId: site.id,
        name: `Categoria ${slug}`,
        slug,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  it('200: válido contra publicCategorySchema, só name/slug', async () => {
    const category = await createCategory(siteA, 'categoria-completa');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories/${category.slug}`,
    );

    expect(response.status).toBe(200);
    expect(publicCategorySchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({ name: category.name, slug: category.slug });
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('archivedAt');
    expect(response.body).not.toHaveProperty('siteId');
  });

  it('404: slug inexistente', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories/slug-que-nao-existe`,
    );

    expect(response.status).toBe(404);
  });

  it('404: slug existe, mas em outro Site (isolamento por Site)', async () => {
    const categoryInSiteB = await createCategory(siteB, 'categoria-de-outro-site');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories/${categoryInSiteB.slug}`,
    );

    expect(response.status).toBe(404);
  });

  it('404: siteSlug inexistente', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/public/sites/pub004-site-inexistente/categories/qualquer-slug',
    );

    expect(response.status).toBe(404);
  });

  it('Categoria arquivada continua resolvível: 200, mesmo corpo de uma ativa', async () => {
    const archivedCategory = await createCategory(siteA, 'categoria-arquivada', {
      archived: true,
    });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories/${archivedCategory.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: archivedCategory.name,
      slug: archivedCategory.slug,
    });
  });

  it('consistência: o categorySlug exposto por um Artigo público resolve normalmente aqui, mesmo com a Categoria arquivada', async () => {
    const category = await createCategory(siteA, 'categoria-vinculada-a-artigo', {
      archived: true,
    });
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Artigo vinculado à Categoria arquivada',
        slug: 'artigo-vinculado-a-categoria-arquivada',
        type: ArticleType.REVIEW,
        status: 'PUBLISHED',
        categoryId: category.id,
        publishedAt: new Date(),
      },
    });

    const articleResponse = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );
    expect(articleResponse.status).toBe(200);
    expect(publicArticleSchema.safeParse(articleResponse.body).success).toBe(true);
    const categorySlugFromArticle = articleResponse.body.categorySlug;
    expect(categorySlugFromArticle).toBe(category.slug);

    const categoryResponse = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories/${categorySlugFromArticle}`,
    );
    expect(categoryResponse.status).toBe(200);
    expect(categoryResponse.body.slug).toBe(category.slug);
  });
});
