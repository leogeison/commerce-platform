import type { Category } from '../../../generated/prisma/client';
import type { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import { UpdateCategoryUseCase } from './update-category.use-case';

const SITE_ID = 'site-1';
const CATEGORY_ID = 'category-1';

function buildFakeRepository(result: unknown) {
  const updateBySite = jest.fn().mockResolvedValue(result);
  const repository = { updateBySite } as unknown as PrismaCategoryRepository;

  return { repository, updateBySite };
}

describe('UpdateCategoryUseCase', () => {
  it('delega ao repository com siteId, id, name e slug, e devolve o resultado tal como recebido', async () => {
    const fakeCategory = { id: CATEGORY_ID, name: 'Nova Categoria', slug: 'nova-categoria' } as unknown as Category;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, category: fakeCategory });
    const useCase = new UpdateCategoryUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      id: CATEGORY_ID,
      name: 'Nova Categoria',
      slug: 'nova-categoria',
    });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: CATEGORY_ID,
      name: 'Nova Categoria',
      slug: 'nova-categoria',
    });
    expect(result).toEqual({ ok: true, category: fakeCategory });
  });

  it('repassa campos omitidos como undefined (PATCH parcial)', async () => {
    const fakeCategory = { id: CATEGORY_ID } as unknown as Category;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, category: fakeCategory });
    const useCase = new UpdateCategoryUseCase(repository);

    await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: CATEGORY_ID,
      name: undefined,
      slug: undefined,
    });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new UpdateCategoryUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID, name: 'X' });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('propaga SLUG_CONFLICT sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'SLUG_CONFLICT' });
    const useCase = new UpdateCategoryUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID, slug: 'ja-existe' });

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
  });
});
