import { ProductArchiveAndRevalidateUseCase } from './product-archive-and-revalidate.use-case';
import type { ArchiveProductUseCase } from '../../catalog/application/archive-product.use-case';
import type { UnarchiveProductUseCase } from '../../catalog/application/unarchive-product.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Product } from '../../../generated/prisma/client';

describe('ProductArchiveAndRevalidateUseCase', () => {
  function build(options: { archiveResult: Product | null; unarchiveResult: Product | null }) {
    const archiveProductUseCase = {
      execute: jest.fn().mockResolvedValue(options.archiveResult),
    } as unknown as jest.Mocked<ArchiveProductUseCase>;

    const unarchiveProductUseCase = {
      execute: jest.fn().mockResolvedValue(options.unarchiveResult),
    } as unknown as jest.Mocked<UnarchiveProductUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForProduct: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new ProductArchiveAndRevalidateUseCase(
      archiveProductUseCase,
      unarchiveProductUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, archiveProductUseCase, unarchiveProductUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    productId: 'product-1',
  };

  describe('archive', () => {
    it('produto não encontrado: não chama REV-005, devolve NOT_FOUND', async () => {
      const { useCase, archiveProductUseCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(archiveProductUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        id: 'product-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).not.toHaveBeenCalled();
    });

    it('arquivamento bem-sucedido: aciona REV-005 com siteId/siteSlug/productId corretos e devolve o Produto', async () => {
      const product = { id: 'product-1', archivedAt: new Date() } as Product;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: product,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, product });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledTimes(1);
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        productId: 'product-1',
      });
    });

    it('sucesso idempotente (Produto já arquivado, CAT-012 devolve o Produto mesmo assim): ainda aciona REV-005', async () => {
      const alreadyArchivedProduct = { id: 'product-1', archivedAt: new Date('2026-01-01') } as Product;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: alreadyArchivedProduct,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, product: alreadyArchivedProduct });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledTimes(1);
    });
  });

  describe('unarchive', () => {
    it('produto não encontrado: não chama REV-005, devolve NOT_FOUND', async () => {
      const { useCase, unarchiveProductUseCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.unarchive(input);

      expect(unarchiveProductUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        id: 'product-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).not.toHaveBeenCalled();
    });

    it('desarquivamento bem-sucedido: aciona REV-005 com siteId/siteSlug/productId corretos e devolve o Produto', async () => {
      const product = { id: 'product-1', archivedAt: null } as Product;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: product,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, product });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledTimes(1);
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        productId: 'product-1',
      });
    });

    it('sucesso idempotente (Produto já ativo, CAT-013 devolve o Produto mesmo assim): ainda aciona REV-005', async () => {
      const alreadyActiveProduct = { id: 'product-1', archivedAt: null } as Product;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: alreadyActiveProduct,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, product: alreadyActiveProduct });
      expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledTimes(1);
    });
  });
});
