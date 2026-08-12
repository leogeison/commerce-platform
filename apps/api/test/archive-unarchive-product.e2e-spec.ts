import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ArchiveProductUseCase } from '../src/modules/catalog/application/archive-product.use-case';
import { UnarchiveProductUseCase } from '../src/modules/catalog/application/unarchive-product.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import type { Product, Site } from '../src/generated/prisma/client';

/**
 * `ArchiveProductUseCase`/`UnarchiveProductUseCase` (e2e, CAT-012/CAT-013)
 * — operações **internas** do Catalog, sem controller/rota HTTP própria
 * (endpoint real é `REV-011`, ver `archive-unarchive-product-revalidation.e2e-spec.ts`).
 * Mesmo padrão de `delete-category.e2e-spec.ts`: chama os casos de uso
 * diretamente (sem HTTP), com Postgres real (mesmo requisito de
 * `database.e2e-spec.ts`).
 */
describe('ArchiveProductUseCase / UnarchiveProductUseCase (CAT-012/CAT-013, operação interna)', () => {
  let app: INestApplication<App> | undefined;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let archiveUseCase: ArchiveProductUseCase;
  let unarchiveUseCase: UnarchiveProductUseCase;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    archiveUseCase = moduleRef.get(ArchiveProductUseCase);
    unarchiveUseCase = moduleRef.get(UnarchiveProductUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'cat012-site-a',
        name: 'Cat012 Site A',
        domain: 'cat012-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat012-site-b',
        name: 'Cat012 Site B',
        domain: 'cat012-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat012-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat012-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createProduct(
    site: Site,
    name: string,
    slug: string,
    archived = false,
  ): Promise<Product> {
    return prisma.product.create({
      data: { siteId: site.id, name, slug, archivedAt: archived ? new Date() : null },
    });
  }

  describe('archive', () => {
    it('arquiva um Produto ativo: archivedAt preenchido', async () => {
      const product = await createProduct(siteA, 'Eletrônicos', 'eletronicos');

      const result = await archiveUseCase.execute({ siteId: siteA.id, id: product.id });

      expect(result).not.toBeNull();
      expect(result?.archivedAt).not.toBeNull();
    });

    it('idempotente: arquivar duas vezes mantém o mesmo archivedAt', async () => {
      const product = await createProduct(siteA, 'Casa', 'casa');

      const first = await archiveUseCase.execute({ siteId: siteA.id, id: product.id });
      const second = await archiveUseCase.execute({ siteId: siteA.id, id: product.id });

      expect(second?.archivedAt?.getTime()).toBe(first?.archivedAt?.getTime());
    });

    it('id inexistente no próprio Site: null', async () => {
      const result = await archiveUseCase.execute({
        siteId: siteA.id,
        id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result).toBeNull();
    });

    it('id de Produto real de outro Site: null (isolamento), Produto do outro Site inalterado', async () => {
      const productFromSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');

      const result = await archiveUseCase.execute({
        siteId: siteA.id,
        id: productFromSiteB.id,
      });

      expect(result).toBeNull();

      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productFromSiteB.id },
      });
      expect(persisted.archivedAt).toBeNull();
    });
  });

  describe('unarchive', () => {
    it('desarquiva um Produto arquivado: archivedAt: null', async () => {
      const product = await createProduct(siteA, 'Esportes', 'esportes', true);

      const result = await unarchiveUseCase.execute({ siteId: siteA.id, id: product.id });

      expect(result).not.toBeNull();
      expect(result?.archivedAt).toBeNull();
    });

    it('idempotente: desarquivar duas vezes mantém archivedAt: null', async () => {
      const product = await createProduct(siteA, 'Games', 'games', true);

      const first = await unarchiveUseCase.execute({ siteId: siteA.id, id: product.id });
      const second = await unarchiveUseCase.execute({ siteId: siteA.id, id: product.id });

      expect(first?.archivedAt).toBeNull();
      expect(second?.archivedAt).toBeNull();
    });

    it('id inexistente no próprio Site: null', async () => {
      const result = await unarchiveUseCase.execute({
        siteId: siteA.id,
        id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result).toBeNull();
    });

    it('id de Produto real de outro Site: null (isolamento), Produto do outro Site inalterado', async () => {
      const productFromSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b', true);

      const result = await unarchiveUseCase.execute({
        siteId: siteA.id,
        id: productFromSiteB.id,
      });

      expect(result).toBeNull();

      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productFromSiteB.id },
      });
      expect(persisted.archivedAt).not.toBeNull();
    });
  });
});
