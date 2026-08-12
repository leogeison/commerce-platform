import { UpdateCategoryAndRevalidateUseCase } from './update-category-and-revalidate.use-case';
import type {
  UpdateCategoryUseCase,
  UpdateCategoryResult,
} from '../../catalog/application/update-category.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Category } from '../../../generated/prisma/client';

describe('UpdateCategoryAndRevalidateUseCase', () => {
  function build(updateResult: UpdateCategoryResult) {
    const updateCategoryUseCase = {
      execute: jest.fn().mockResolvedValue(updateResult),
    } as unknown as jest.Mocked<UpdateCategoryUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForCategory: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new UpdateCategoryAndRevalidateUseCase(
      updateCategoryUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, updateCategoryUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    categoryId: 'category-1',
    name: 'Nova Categoria',
    slug: 'nova-categoria',
  };

  it('categoria não encontrada: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, updateCategoryUseCase, revalidateAffectedArticlesUseCase } = build({
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
    expect(revalidateAffectedArticlesUseCase.revalidateForCategory).not.toHaveBeenCalled();
  });

  it('slug conflitante: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'SLUG_CONFLICT',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
    expect(revalidateAffectedArticlesUseCase.revalidateForCategory).not.toHaveBeenCalled();
  });

  it('atualização bem-sucedida: aciona REV-005 com siteId/siteSlug/categoryId corretos e devolve a Categoria atualizada', async () => {
    const category = { id: 'category-1', name: 'Nova Categoria', slug: 'nova-categoria' } as Category;
    const { useCase, revalidateAffectedArticlesUseCase } = build({ ok: true, category });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, category });
    expect(revalidateAffectedArticlesUseCase.revalidateForCategory).toHaveBeenCalledTimes(1);
    expect(revalidateAffectedArticlesUseCase.revalidateForCategory).toHaveBeenCalledWith({
      siteId: 'site-1',
      siteSlug: 'fastcompre',
      categoryId: 'category-1',
    });
  });
});
