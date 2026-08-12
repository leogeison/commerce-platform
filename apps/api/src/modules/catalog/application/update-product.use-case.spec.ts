import type { Product } from '../../../generated/prisma/client';
import type { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import { UpdateProductUseCase } from './update-product.use-case';

const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';

function buildFakeRepository(result: unknown) {
  const updateBySite = jest.fn().mockResolvedValue(result);
  const repository = { updateBySite } as unknown as PrismaProductRepository;

  return { repository, updateBySite };
}

describe('UpdateProductUseCase', () => {
  it('delega ao repository com siteId, id e todos os campos, e devolve o resultado tal como recebido', async () => {
    const fakeProduct = { id: PRODUCT_ID, name: 'Novo Produto', slug: 'novo-produto' } as unknown as Product;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, product: fakeProduct });
    const useCase = new UpdateProductUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      name: 'Novo Produto',
      slug: 'novo-produto',
      categoryId: 'category-1',
      description: 'Descrição nova',
      imageUrl: 'https://example.com/nova.png',
    });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      name: 'Novo Produto',
      slug: 'novo-produto',
      categoryId: 'category-1',
      description: 'Descrição nova',
      imageUrl: 'https://example.com/nova.png',
    });
    expect(result).toEqual({ ok: true, product: fakeProduct });
  });

  it('repassa campos omitidos como undefined (PATCH parcial)', async () => {
    const fakeProduct = { id: PRODUCT_ID } as unknown as Product;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, product: fakeProduct });
    const useCase = new UpdateProductUseCase(repository);

    await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      name: undefined,
      slug: undefined,
      categoryId: undefined,
      description: undefined,
      imageUrl: undefined,
    });
  });

  it('repassa null explícito para categoryId/description/imageUrl sem colapsar com undefined', async () => {
    const fakeProduct = { id: PRODUCT_ID } as unknown as Product;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, product: fakeProduct });
    const useCase = new UpdateProductUseCase(repository);

    await useCase.execute({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      categoryId: null,
      description: null,
      imageUrl: null,
    });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      name: undefined,
      slug: undefined,
      categoryId: null,
      description: null,
      imageUrl: null,
    });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new UpdateProductUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID, name: 'X' });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('propaga SLUG_CONFLICT sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'SLUG_CONFLICT' });
    const useCase = new UpdateProductUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID, slug: 'ja-existe' });

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
  });

  it('propaga CATEGORY_NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'CATEGORY_NOT_FOUND' });
    const useCase = new UpdateProductUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      id: PRODUCT_ID,
      categoryId: 'categoria-inexistente',
    });

    expect(result).toEqual({ ok: false, reason: 'CATEGORY_NOT_FOUND' });
  });
});
