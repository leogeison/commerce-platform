import type { DeleteProductUseCase } from '../../catalog/application/delete-product.use-case';
import type { PrismaArticleProductRepository } from '../../editorial/infrastructure/prisma-article-product.repository';
import { RemoveProductUseCase } from './remove-product.use-case';

const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';

function buildFakes(fixtures: {
  existsByProductResults: boolean[];
  deleteResult: unknown;
}) {
  const existsByProduct = jest.fn();
  fixtures.existsByProductResults.forEach((value) => {
    existsByProduct.mockResolvedValueOnce(value);
  });

  const deleteExecute = jest.fn().mockResolvedValue(fixtures.deleteResult);

  const articleProductRepository = {
    existsByProduct,
  } as unknown as PrismaArticleProductRepository;
  const deleteProductUseCase = { execute: deleteExecute } as unknown as DeleteProductUseCase;

  const useCase = new RemoveProductUseCase(articleProductRepository, deleteProductUseCase);

  return { useCase, existsByProduct, deleteExecute };
}

describe('RemoveProductUseCase', () => {
  it('vínculo com Artigo já existente na pré-checagem: LINKED_TO_ARTICLE, CAT-014 nunca é chamado', async () => {
    const { useCase, existsByProduct, deleteExecute } = buildFakes({
      existsByProductResults: [true],
      deleteResult: { ok: true },
    });

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID });

    expect(result).toEqual({ ok: false, reason: 'LINKED_TO_ARTICLE' });
    expect(existsByProduct).toHaveBeenCalledTimes(1);
    expect(existsByProduct).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID);
    expect(deleteExecute).not.toHaveBeenCalled();
  });

  it('sem vínculo: sucesso, delega a CAT-014 com siteId e productId', async () => {
    const { useCase, existsByProduct, deleteExecute } = buildFakes({
      existsByProductResults: [false],
      deleteResult: { ok: true },
    });

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID });

    expect(result).toEqual({ ok: true });
    expect(existsByProduct).toHaveBeenCalledTimes(1);
    expect(deleteExecute).toHaveBeenCalledTimes(1);
    expect(deleteExecute).toHaveBeenCalledWith({ siteId: SITE_ID, id: PRODUCT_ID });
  });

  it('sem vínculo, CAT-014 devolve NOT_FOUND: propaga sem reconsultar existsByProduct', async () => {
    const { useCase, existsByProduct } = buildFakes({
      existsByProductResults: [false],
      deleteResult: { ok: false, reason: 'NOT_FOUND' },
    });

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(existsByProduct).toHaveBeenCalledTimes(1);
  });

  describe('corrida: CAT-014 devolve HAS_OFFERS depois da pré-checagem sem vínculo', () => {
    it('reconsulta confirma que ainda não há vínculo: preserva HAS_OFFERS', async () => {
      const { useCase, existsByProduct } = buildFakes({
        existsByProductResults: [false, false],
        deleteResult: { ok: false, reason: 'HAS_OFFERS' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID });

      expect(result).toEqual({ ok: false, reason: 'HAS_OFFERS' });
      expect(existsByProduct).toHaveBeenCalledTimes(2);
    });

    it('reconsulta encontra vínculo criado nesse meio-tempo: traduz para LINKED_TO_ARTICLE (false → HAS_OFFERS → true)', async () => {
      const { useCase, existsByProduct } = buildFakes({
        existsByProductResults: [false, true],
        deleteResult: { ok: false, reason: 'HAS_OFFERS' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID });

      expect(result).toEqual({ ok: false, reason: 'LINKED_TO_ARTICLE' });
      expect(existsByProduct).toHaveBeenCalledTimes(2);
      expect(existsByProduct).toHaveBeenNthCalledWith(1, SITE_ID, PRODUCT_ID);
      expect(existsByProduct).toHaveBeenNthCalledWith(2, SITE_ID, PRODUCT_ID);
    });
  });
});
