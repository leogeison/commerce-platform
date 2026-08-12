import { UpdateProductAndRevalidateUseCase } from './update-product-and-revalidate.use-case';
import type {
  UpdateProductUseCase,
  UpdateProductResult,
} from '../../catalog/application/update-product.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Product } from '../../../generated/prisma/client';

describe('UpdateProductAndRevalidateUseCase', () => {
  function build(updateResult: UpdateProductResult) {
    const updateProductUseCase = {
      execute: jest.fn().mockResolvedValue(updateResult),
    } as unknown as jest.Mocked<UpdateProductUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForProduct: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new UpdateProductAndRevalidateUseCase(
      updateProductUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, updateProductUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    productId: 'product-1',
    name: 'Novo Produto',
    slug: 'novo-produto',
    categoryId: 'category-1',
    description: 'Descrição nova',
    imageUrl: 'https://example.com/nova.png',
  };

  it('produto não encontrado: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, updateProductUseCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(updateProductUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      id: 'product-1',
      name: 'Novo Produto',
      slug: 'novo-produto',
      categoryId: 'category-1',
      description: 'Descrição nova',
      imageUrl: 'https://example.com/nova.png',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(revalidateAffectedArticlesUseCase.revalidateForProduct).not.toHaveBeenCalled();
  });

  it('slug conflitante: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'SLUG_CONFLICT',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
    expect(revalidateAffectedArticlesUseCase.revalidateForProduct).not.toHaveBeenCalled();
  });

  it('categoryId inválido: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'CATEGORY_NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'CATEGORY_NOT_FOUND' });
    expect(revalidateAffectedArticlesUseCase.revalidateForProduct).not.toHaveBeenCalled();
  });

  it('atualização bem-sucedida: aciona REV-005 com siteId/siteSlug/productId corretos e devolve o Produto atualizado', async () => {
    const product = { id: 'product-1', name: 'Novo Produto', slug: 'novo-produto' } as Product;
    const { useCase, revalidateAffectedArticlesUseCase } = build({ ok: true, product });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, product });
    expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledTimes(1);
    expect(revalidateAffectedArticlesUseCase.revalidateForProduct).toHaveBeenCalledWith({
      siteId: 'site-1',
      siteSlug: 'fastcompre',
      productId: 'product-1',
    });
  });
});
