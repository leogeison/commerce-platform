import type { DeleteCategoryUseCase } from '../../catalog/application/delete-category.use-case';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { RemoveCategoryUseCase } from './remove-category.use-case';

const SITE_ID = 'site-1';
const CATEGORY_ID = 'category-1';

function buildFakes(fixtures: {
  existsByCategoryResults: boolean[];
  deleteResult: unknown;
}) {
  const existsByCategory = jest.fn();
  fixtures.existsByCategoryResults.forEach((value) => {
    existsByCategory.mockResolvedValueOnce(value);
  });

  const deleteExecute = jest.fn().mockResolvedValue(fixtures.deleteResult);

  const articleRepository = {
    existsByCategory,
  } as unknown as PrismaArticleRepository;
  const deleteCategoryUseCase = { execute: deleteExecute } as unknown as DeleteCategoryUseCase;

  const useCase = new RemoveCategoryUseCase(articleRepository, deleteCategoryUseCase);

  return { useCase, existsByCategory, deleteExecute };
}

describe('RemoveCategoryUseCase', () => {
  it('vínculo com Artigo já existente na pré-checagem: LINKED_TO_ARTICLE, CAT-007 nunca é chamado', async () => {
    const { useCase, existsByCategory, deleteExecute } = buildFakes({
      existsByCategoryResults: [true],
      deleteResult: { ok: true },
    });

    const result = await useCase.execute({ siteId: SITE_ID, categoryId: CATEGORY_ID });

    expect(result).toEqual({ ok: false, reason: 'LINKED_TO_ARTICLE' });
    expect(existsByCategory).toHaveBeenCalledTimes(1);
    expect(existsByCategory).toHaveBeenCalledWith(SITE_ID, CATEGORY_ID);
    expect(deleteExecute).not.toHaveBeenCalled();
  });

  it('sem vínculo: sucesso, delega a CAT-007 com siteId e categoryId', async () => {
    const { useCase, existsByCategory, deleteExecute } = buildFakes({
      existsByCategoryResults: [false],
      deleteResult: { ok: true },
    });

    const result = await useCase.execute({ siteId: SITE_ID, categoryId: CATEGORY_ID });

    expect(result).toEqual({ ok: true });
    expect(existsByCategory).toHaveBeenCalledTimes(1);
    expect(deleteExecute).toHaveBeenCalledTimes(1);
    expect(deleteExecute).toHaveBeenCalledWith({ siteId: SITE_ID, id: CATEGORY_ID });
  });

  it('sem vínculo, CAT-007 devolve NOT_FOUND: propaga sem reconsultar existsByCategory', async () => {
    const { useCase, existsByCategory } = buildFakes({
      existsByCategoryResults: [false],
      deleteResult: { ok: false, reason: 'NOT_FOUND' },
    });

    const result = await useCase.execute({ siteId: SITE_ID, categoryId: CATEGORY_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(existsByCategory).toHaveBeenCalledTimes(1);
  });

  describe('corrida: CAT-007 devolve HAS_PRODUCTS depois da pré-checagem sem vínculo', () => {
    it('reconsulta confirma que ainda não há vínculo: preserva HAS_PRODUCTS', async () => {
      const { useCase, existsByCategory } = buildFakes({
        existsByCategoryResults: [false, false],
        deleteResult: { ok: false, reason: 'HAS_PRODUCTS' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, categoryId: CATEGORY_ID });

      expect(result).toEqual({ ok: false, reason: 'HAS_PRODUCTS' });
      expect(existsByCategory).toHaveBeenCalledTimes(2);
    });

    it('reconsulta encontra vínculo criado nesse meio-tempo: traduz para LINKED_TO_ARTICLE (false → HAS_PRODUCTS → true)', async () => {
      const { useCase, existsByCategory } = buildFakes({
        existsByCategoryResults: [false, true],
        deleteResult: { ok: false, reason: 'HAS_PRODUCTS' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, categoryId: CATEGORY_ID });

      expect(result).toEqual({ ok: false, reason: 'LINKED_TO_ARTICLE' });
      expect(existsByCategory).toHaveBeenCalledTimes(2);
      expect(existsByCategory).toHaveBeenNthCalledWith(1, SITE_ID, CATEGORY_ID);
      expect(existsByCategory).toHaveBeenNthCalledWith(2, SITE_ID, CATEGORY_ID);
    });
  });
});
