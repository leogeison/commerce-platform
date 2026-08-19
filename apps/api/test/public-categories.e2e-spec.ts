import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { listPublicCategoriesResponseSchema } from '@commerce-platform/contracts';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import type { Category, Site } from '../src/generated/prisma/client';

/**
 * `GET /public/sites/:siteSlug/categories` (e2e, UXF-010). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 */
describe('GET /public/sites/:siteSlug/categories (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'uxf010-site-a',
        name: 'Uxf010 Site A',
        domain: 'uxf010-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'uxf010-site-b',
        name: 'Uxf010 Site B',
        domain: 'uxf010-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'uxf010-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'uxf010-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createCategory(
    site: Site,
    slug: string,
    overrides: Partial<{ name: string; archived: boolean }> = {},
  ): Promise<Category> {
    return prisma.category.create({
      data: {
        siteId: site.id,
        name: overrides.name ?? `Categoria ${slug}`,
        slug,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  it('lista vazia: 200, envelope paginado completo e válido contra listPublicCategoriesResponseSchema', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories`,
    );

    expect(response.status).toBe(200);
    expect(listPublicCategoriesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('Categoria arquivada nunca aparece; não arquivada aparece normalmente', async () => {
    await createCategory(siteA, 'arquivada', { archived: true });
    await createCategory(siteA, 'ativa');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories`,
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].slug).toBe('ativa');
  });

  it('cada item é só name/slug — não expõe id/siteId/archivedAt/createdAt/updatedAt', async () => {
    await createCategory(siteA, 'categoria-presenter');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual({ name: 'Categoria categoria-presenter', slug: 'categoria-presenter' });
    expect(response.body.items[0]).not.toHaveProperty('id');
    expect(response.body.items[0]).not.toHaveProperty('siteId');
    expect(response.body.items[0]).not.toHaveProperty('archivedAt');
    expect(response.body.items[0]).not.toHaveProperty('createdAt');
    expect(response.body.items[0]).not.toHaveProperty('updatedAt');
  });

  it('isolamento cross-site: consultando com siteSlug do Site A, Categorias do Site B nunca aparecem', async () => {
    await createCategory(siteA, 'do-site-a');
    await createCategory(siteB, 'do-site-b');

    const responseA = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories`,
    );
    expect(responseA.status).toBe(200);
    expect(responseA.body.total).toBe(1);
    expect(responseA.body.items[0].slug).toBe('do-site-a');

    const responseB = await request(app!.getHttpServer()).get(
      `/public/sites/${siteB.slug}/categories`,
    );
    expect(responseB.status).toBe(200);
    expect(responseB.body.total).toBe(1);
    expect(responseB.body.items[0].slug).toBe('do-site-b');
  });

  it('ordenação alfabética por name asc', async () => {
    await createCategory(siteA, 'categoria-c', { name: 'Charlie' });
    await createCategory(siteA, 'categoria-a', { name: 'Alpha' });
    await createCategory(siteA, 'categoria-b', { name: 'Bravo' });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/categories`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('paginação: pageSize=2 devolve 2 itens, total e totalPages corretos; página acima do total devolve items: []', async () => {
    await createCategory(siteA, 'categoria-a', { name: 'Alpha' });
    await createCategory(siteA, 'categoria-b', { name: 'Bravo' });
    await createCategory(siteA, 'categoria-c', { name: 'Charlie' });

    const firstPage = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/categories`)
      .query({ page: 1, pageSize: 2 });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.totalPages).toBe(2);

    const beyondLastPage = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/categories`)
      .query({ page: 3, pageSize: 2 });

    expect(beyondLastPage.status).toBe(200);
    expect(beyondLastPage.body.items).toEqual([]);
    expect(beyondLastPage.body.total).toBe(3);
    expect(beyondLastPage.body.totalPages).toBe(2);
  });

  it('siteSlug inexistente: 404', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/public/sites/uxf010-site-inexistente/categories',
    );

    expect(response.status).toBe(404);
  });

  it('page=0: 422', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/categories`)
      .query({ page: 0 });

    expect(response.status).toBe(422);
  });

  it('pageSize=101 (acima do máximo permitido): 422', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/public/sites/${siteA.slug}/categories`)
      .query({ pageSize: 101 });

    expect(response.status).toBe(422);
  });
});
