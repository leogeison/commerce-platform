import { CreateCategoryAndRevalidateUseCase } from './create-category-and-revalidate.use-case';
import type {
  CreateCategoryUseCase,
  CreateCategoryResult,
} from '../../catalog/application/create-category.use-case';
import type { RevalidateCategoryUseCase } from './revalidate-category.use-case';
import type { Category } from '../../../generated/prisma/client';

describe('CreateCategoryAndRevalidateUseCase', () => {
  function build(createResult: CreateCategoryResult) {
    const createCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(createResult),
    } as unknown as jest.Mocked<CreateCategoryUseCase>;

    const revalidateCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateCategoryUseCase>;

    const useCase = new CreateCategoryAndRevalidateUseCase(
      createCategoryUseCase,
      revalidateCategoryUseCase,
    );

    return { useCase, createCategoryUseCase, revalidateCategoryUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    name: 'Eletrônicos',
    slug: 'eletronicos',
  };

  it('slug conflitante: não chama a revalidação, devolve o resultado como veio', async () => {
    const { useCase, createCategoryUseCase, revalidateCategoryUseCase } = build({
      ok: false,
      reason: 'SLUG_CONFLICT',
    });

    const result = await useCase.execute(input);

    expect(createCategoryUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      name: 'Eletrônicos',
      slug: 'eletronicos',
    });
    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
    expect(revalidateCategoryUseCase.execute).not.toHaveBeenCalled();
  });

  it('criação bem-sucedida: aciona a revalidação com siteId/siteSlug/categoryId corretos e devolve a Categoria criada', async () => {
    const category = { id: 'category-1', name: 'Eletrônicos', slug: 'eletronicos' } as Category;
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
