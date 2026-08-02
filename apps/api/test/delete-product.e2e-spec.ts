import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { DeleteProductUseCase } from '../src/modules/catalog/application/delete-product.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace } from '../src/generated/prisma/enums';
import type { Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * `DeleteProductUseCase` (e2e, CAT-014) — operação **interna** do Catalog,
 * sem controller/rota HTTP própria. Mesmo padrão de
 * `delete-category.e2e-spec.ts` (CAT-007): chama o caso de uso diretamente
 * (sem HTTP), com Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * `app`/`supertest` só entram no último teste, para provar que nenhuma
 * rota HTTP alcança esta exclusão.
 */
describe('DeleteProductUseCase (CAT-014, operação interna)', () => {
  let app: INestApplication<App> | undefined;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let useCase: DeleteProductUseCase;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    useCase = moduleRef.get(DeleteProductUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'cat014-site-a',
        name: 'Cat014 Site A',
        domain: 'cat014-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat014-site-b',
        name: 'Cat014 Site B',
        domain: 'cat014-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat014-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat014-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat014-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createProduct(site: Site, name: string, slug: string): Promise<Product> {
    return prisma.product.create({ data: { siteId: site.id, name, slug } });
  }

  async function createOffer(site: Site, product: Product): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '99.90',
        currency: 'BRL',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
        inStock: true,
      },
    });
  }

  it('sucesso: exclui fisicamente o Produto sem Oferta vinculada', async () => {
    const product = await createProduct(siteA, 'Fone Bluetooth', 'fone-bluetooth');

    const result = await useCase.execute({ siteId: siteA.id, id: product.id });

    expect(result).toEqual({ ok: true });
    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted).toBeNull();
  });

  it('bloqueado por Oferta vinculada: HAS_OFFERS, Produto e Oferta continuam persistidos', async () => {
    const product = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som');
    const offer = await createOffer(siteA, product);

    const result = await useCase.execute({ siteId: siteA.id, id: product.id });

    expect(result).toEqual({ ok: false, reason: 'HAS_OFFERS' });

    const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    const persistedOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persistedProduct).not.toBeNull();
    expect(persistedOffer).not.toBeNull();
  });

  it('id inexistente no próprio Site: NOT_FOUND', async () => {
    const result = await useCase.execute({
      siteId: siteA.id,
      id: '00000000-0000-0000-0000-000000000000',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('id de Produto real de outro Site: NOT_FOUND (isolamento), Produto do outro Site preservado', async () => {
    const productFromSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');

    const result = await useCase.execute({ siteId: siteA.id, id: productFromSiteB.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const persisted = await prisma.product.findUnique({
      where: { id: productFromSiteB.id },
    });
    expect(persisted).not.toBeNull();
  });

  it('nenhuma rota HTTP expõe exclusão: DELETE /admin/sites/:siteSlug/products/:id não existe (404)', async () => {
    const product = await createProduct(siteA, 'Moda', 'moda');

    const response = await request(app!.getHttpServer()).delete(
      `/admin/sites/${siteA.slug}/products/${product.id}`,
    );

    expect(response.status).toBe(404);
  });
});
