import { CategoryArchiveAndRevalidateUseCase } from './category-archive-and-revalidate.use-case';
import type { ArchiveCategoryUseCase } from '../../catalog/application/archive-category.use-case';
import type { UnarchiveCategoryUseCase } from '../../catalog/application/unarchive-category.use-case';
import type { RevalidateCategoryUseCase } from './revalidate-category.use-case';
import type { Category } from '../../../generated/prisma/client';

describe('CategoryArchiveAndRevalidateUseCase', () => {
  function build(options: { archiveResult: Category | null; unarchiveResult: Category | null }) {
    const archiveCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(options.archiveResult),
    } as unknown as jest.Mocked<ArchiveCategoryUseCase>;

    const unarchiveCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(options.unarchiveResult),
    } as unknown as jest.Mocked<UnarchiveCategoryUseCase>;

    const revalidateCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateCategoryUseCase>;

    const useCase = new CategoryArchiveAndRevalidateUseCase(
      archiveCategoryUseCase,
      unarchiveCategoryUseCase,
      revalidateCategoryUseCase,
    );

    return { useCase, archiveCategoryUseCase, unarchiveCategoryUseCase, revalidateCategoryUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    categoryId: 'category-1',
  };

  describe('archive', () => {
    it('categoria não encontrada: não chama a revalidação, devolve NOT_FOUND', async () => {
      const { useCase, archiveCategoryUseCase, revalidateCategoryUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(archiveCategoryUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        id: 'category-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateCategoryUseCase.execute).not.toHaveBeenCalled();
    });

    it('arquivamento bem-sucedido: aciona a revalidação com siteId/siteSlug/categoryId corretos e devolve a Categoria', async () => {
      const category = { id: 'category-1', archivedAt: new Date() } as Category;
      const { useCase, revalidateCategoryUseCase } = build({
        archiveResult: category,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, category });
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledTimes(1);
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        categoryId: 'category-1',
      });
    });

    it('sucesso idempotente (Categoria já arquivada, CAT-005 devolve a Categoria mesmo assim): ainda aciona a revalidação', async () => {
      const alreadyArchivedCategory = { id: 'category-1', archivedAt: new Date('2026-01-01') } as Category;
      const { useCase, revalidateCategoryUseCase } = build({
        archiveResult: alreadyArchivedCategory,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, category: alreadyArchivedCategory });
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('unarchive', () => {
    it('categoria não encontrada: não chama a revalidação, devolve NOT_FOUND', async () => {
      const { useCase, unarchiveCategoryUseCase, revalidateCategoryUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.unarchive(input);

      expect(unarchiveCategoryUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        id: 'category-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateCategoryUseCase.execute).not.toHaveBeenCalled();
    });

    it('desarquivamento bem-sucedido: aciona a revalidação com siteId/siteSlug/categoryId corretos e devolve a Categoria', async () => {
      const category = { id: 'category-1', archivedAt: null } as Category;
      const { useCase, revalidateCategoryUseCase } = build({
        archiveResult: null,
        unarchiveResult: category,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, category });
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledTimes(1);
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        categoryId: 'category-1',
      });
    });

    it('sucesso idempotente (Categoria já ativa, CAT-006 devolve a Categoria mesmo assim): ainda aciona a revalidação', async () => {
      const alreadyActiveCategory = { id: 'category-1', archivedAt: null } as Category;
      const { useCase, revalidateCategoryUseCase } = build({
        archiveResult: null,
        unarchiveResult: alreadyActiveCategory,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, category: alreadyActiveCategory });
      expect(revalidateCategoryUseCase.execute).toHaveBeenCalledTimes(1);
    });
  });
});
