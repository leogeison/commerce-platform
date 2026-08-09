import type { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import { GetPublicCategoryUseCase } from './get-public-category.use-case';

const SITE_ID = 'site-1';
const SLUG = 'categoria-exemplo';

function buildFakeRepository(result: unknown) {
  const findOneBySlug = jest.fn().mockResolvedValue(result);
  const categoryRepository = {
    findOneBySlug,
  } as unknown as PrismaCategoryRepository;

  return { categoryRepository, findOneBySlug };
}

describe('GetPublicCategoryUseCase', () => {
  it('repassa siteId/slug ao repository', async () => {
    const { categoryRepository, findOneBySlug } = buildFakeRepository(null);
    const useCase = new GetPublicCategoryUseCase(categoryRepository);

    await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(findOneBySlug).toHaveBeenCalledWith(SITE_ID, SLUG);
  });

  it('devolve null quando o repository devolve null (não encontrada ou outro Site)', async () => {
    const { categoryRepository } = buildFakeRepository(null);
    const useCase = new GetPublicCategoryUseCase(categoryRepository);

    const result = await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(result).toBeNull();
  });

  it('devolve exatamente o que o repository devolveu, sem transformar (inclusive Categoria arquivada)', async () => {
    const category = { id: 'category-1', slug: SLUG, archivedAt: new Date() };
    const { categoryRepository } = buildFakeRepository(category);
    const useCase = new GetPublicCategoryUseCase(categoryRepository);

    const result = await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(result).toBe(category);
  });
});
