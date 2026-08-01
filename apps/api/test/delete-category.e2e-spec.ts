import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { DeleteCategoryUseCase } from '../src/modules/catalog/application/delete-category.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import type { Category, Product, Site } from '../src/generated/prisma/client';

/**
 * `DeleteCategoryUseCase` (e2e, CAT-007) — operação **interna** do
 * Catalog, sem controller/rota HTTP própria. Mesmo padrão de
 * `provision-tenant.e2e-spec.ts`: chama o caso de uso diretamente (sem
 * HTTP), com Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * `app`/`supertest` só entram no último teste, para provar que nenhuma
 * rota HTTP alcança esta exclusão.
 */
describe('DeleteCategoryUseCase (CAT-007, operação interna)', () => {
  let app: INestApplication<App> | undefined;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let useCase: DeleteCategoryUseCase;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    useCase = moduleRef.get(DeleteCategoryUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'cat007-site-a',
        name: 'Cat007 Site A',
        domain: 'cat007-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat007-site-b',
        name: 'Cat007 Site B',
        domain: 'cat007-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat007-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'cat007-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat007-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createCategory(
    site: Site,
    name: string,
    slug: string,
  ): Promise<Category> {
    return prisma.category.create({ data: { siteId: site.id, name, slug } });
  }

  async function createProduct(
    site: Site,
    category: Category,
    name: string,
    slug: string,
  ): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, categoryId: category.id, name, slug },
    });
  }

  it('sucesso: exclui fisicamente a Categoria sem Produto vinculado', async () => {
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos');

    const result = await useCase.execute({ siteId: siteA.id, id: category.id });

    expect(result).toEqual({ ok: true });
    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted).toBeNull();
  });

  it('bloqueado por Produto vinculado: HAS_PRODUCTS, Categoria e Produto continuam persistidos', async () => {
    const category = await createCategory(siteA, 'Casa', 'casa');
    const product = await createProduct(siteA, category, 'Sofá', 'sofa');

    const result = await useCase.execute({ siteId: siteA.id, id: category.id });

    expect(result).toEqual({ ok: false, reason: 'HAS_PRODUCTS' });

    const persistedCategory = await prisma.category.findUnique({
      where: { id: category.id },
    });
    const persistedProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(persistedCategory).not.toBeNull();
    expect(persistedProduct).not.toBeNull();
  });

  it('id inexistente no próprio Site: NOT_FOUND', async () => {
    const result = await useCase.execute({
      siteId: siteA.id,
      id: '00000000-0000-0000-0000-000000000000',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('id de Categoria real de outro Site: NOT_FOUND (isolamento), Categoria do outro Site preservada', async () => {
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b');

    const result = await useCase.execute({ siteId: siteA.id, id: categoryFromSiteB.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const persisted = await prisma.category.findUnique({
      where: { id: categoryFromSiteB.id },
    });
    expect(persisted).not.toBeNull();
  });

  it('nenhuma rota HTTP expõe exclusão: DELETE /admin/sites/:siteSlug/categories/:id não existe (404)', async () => {
    const category = await createCategory(siteA, 'Moda', 'moda');

    const response = await request(app!.getHttpServer()).delete(
      `/admin/sites/${siteA.slug}/categories/${category.id}`,
    );

    expect(response.status).toBe(404);
  });
});
