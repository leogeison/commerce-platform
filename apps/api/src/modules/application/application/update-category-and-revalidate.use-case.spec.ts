import { UpdateCategoryAndRevalidateUseCase } from './update-category-and-revalidate.use-case';
import type {
  UpdateCategoryUseCase,
  UpdateCategoryResult,
} from '../../catalog/application/update-category.use-case';
import type { RevalidateCategoryUseCase } from './revalidate-category.use-case';
import type { Category } from '../../../generated/prisma/client';

describe('UpdateCategoryAndRevalidateUseCase', () => {
  function build(updateResult: UpdateCategoryResult) {
    const updateCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(updateResult),
    } as unknown as jest.Mocked<UpdateCategoryUseCase>;

    const revalidateCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateCategoryUseCase>;

    const useCase = new UpdateCategoryAndRevalidateUseCase(
      updateCategoryUseCase,
      revalidateCategoryUseCase,
    );

    return { useCase, updateCategoryUseCase, revalidateCategoryUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    categoryId: 'category-1',
    name: 'Nova Categoria',
    slug: 'nova-categoria',
  };

  it('categoria não encontrada: não chama a revalidação, devolve o resultado como veio', async () => {
    const { useCase, updateCategoryUseCase, revalidateCategoryUseCase } = build({
      ok: false,
      reason: 'NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(updateCategoryUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      id: 'category-1',
      name: 'Nova Categoria',
      slug: 'nova-categoria',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(revalidateCategoryUseCase.execute).not.toHaveBeenCalled();
  });

  it('slug conflitante: não chama a revalidação, devolve o resultado como veio', async () => {
    const { useCase, revalidateCategoryUseCase } = build({
      ok: false,
      reason: 'SLUG_CONFLICT',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
    expect(revalidateCategoryUseCase.execute).not.toHaveBeenCalled();
  });

  it('atualização bem-sucedida: aciona a revalidação com siteId/siteSlug/categoryId corretos e devolve a Categoria atualizada', async () => {
    const category = { id: 'category-1', name: 'Nova Categoria', slug: 'nova-categoria' } as Category;
    const { useCase, revalidateCategoryUseCase } = build({ ok: true, category });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, category });
    expect(revalidateCategoryUseCase.execute).toHaveBeenCalledTimes(1);
    expect(revalidateCategoryUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      siteSlug: 'fastcompre',
      categoryId: 'category-1',
    });
  });
});
