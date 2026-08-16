import type { Product } from '../../../generated/prisma/client';
import type {
  PrismaProductRepository,
  ProductWithOfferSummaries,
} from '../infrastructure/prisma-product.repository';
import { CreateProductUseCase } from './create-product.use-case';
import { GetProductUseCase } from './get-product.use-case';
import { ListProductsUseCase } from './list-products.use-case';
import { ArchiveProductUseCase } from './archive-product.use-case';
import { UnarchiveProductUseCase } from './unarchive-product.use-case';
import { DeleteProductUseCase } from './delete-product.use-case';

/**
 * QA-001 — mesmo critério de `category-use-cases.spec.ts`, aplicado aos 6
 * casos de uso de Produto (CAT-008/009/010/012/013/014). Comportamento real
 * (unicidade de slug, `CATEGORY_NOT_FOUND`, `HAS_OFFERS`) já coberto pelos
 * e2e correspondentes — este spec só prova o roteamento para o repository.
 */
const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';
const CATEGORY_ID = 'category-1';

function buildFakeRepository(methods: Partial<Record<keyof PrismaProductRepository, jest.Mock>>) {
  return methods as unknown as PrismaProductRepository;
}

describe('CreateProductUseCase', () => {
  it('delega ao repository e devolve o resultado tal como recebido (sucesso)', async () => {
    const fakeProduct = { id: PRODUCT_ID, name: 'Fone X' } as unknown as Product;
    const create = jest.fn().mockResolvedValue({ ok: true, product: fakeProduct });
    const useCase = new CreateProductUseCase(buildFakeRepository({ create }));

    const input = { siteId: SITE_ID, categoryId: CATEGORY_ID, name: 'Fone X', slug: 'fone-x' };
    const result = await useCase.execute(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, product: fakeProduct });
  });

  it('propaga CATEGORY_NOT_FOUND sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'CATEGORY_NOT_FOUND' });
    const useCase = new CreateProductUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({ siteId: SITE_ID, name: 'Fone X', slug: 'fone-x' });

    expect(result).toEqual({ ok: false, reason: 'CATEGORY_NOT_FOUND' });
  });

  it('propaga SLUG_CONFLICT sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'SLUG_CONFLICT' });
    const useCase = new CreateProductUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({ siteId: SITE_ID, name: 'Fone X', slug: 'fone-x' });

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
  });
});

describe('GetProductUseCase', () => {
  it('delega a findOneBySiteWithOffers com siteId e id corretos', async () => {
    const fakeProduct = { id: PRODUCT_ID, offers: [] } as unknown as ProductWithOfferSummaries;
    const findOneBySiteWithOffers = jest.fn().mockResolvedValue(fakeProduct);
    const useCase = new GetProductUseCase(buildFakeRepository({ findOneBySiteWithOffers }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(findOneBySiteWithOffers).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID);
    expect(result).toBe(fakeProduct);
  });

  it('devolve null quando não encontra', async () => {
    const findOneBySiteWithOffers = jest.fn().mockResolvedValue(null);
    const useCase = new GetProductUseCase(buildFakeRepository({ findOneBySiteWithOffers }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(result).toBeNull();
  });
});

describe('ListProductsUseCase', () => {
  it('delega findManyBySite propagando categoryId/archived e calcula totalPages', async () => {
    const items = [{ id: PRODUCT_ID }] as unknown as Product[];
    const findManyBySite = jest.fn().mockResolvedValue({ items, total: 21 });
    const useCase = new ListProductsUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      categoryId: CATEGORY_ID,
      archived: false,
    });

    expect(findManyBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      categoryId: CATEGORY_ID,
      archived: false,
    });
    expect(result).toEqual({ items, page: 2, pageSize: 10, total: 21, totalPages: 3 });
  });

  it('total 0 resulta em totalPages 0', async () => {
    const findManyBySite = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = new ListProductsUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(0);
  });
});

describe('ArchiveProductUseCase', () => {
  it('delega a archiveBySite com siteId e id corretos', async () => {
    const fakeProduct = { id: PRODUCT_ID } as unknown as Product;
    const archiveBySite = jest.fn().mockResolvedValue(fakeProduct);
    const useCase = new ArchiveProductUseCase(buildFakeRepository({ archiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(archiveBySite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID);
    expect(result).toBe(fakeProduct);
  });

  it('devolve null quando não existe ou é de outro Site', async () => {
    const archiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new ArchiveProductUseCase(buildFakeRepository({ archiveBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID })).toBeNull();
  });
});

describe('UnarchiveProductUseCase', () => {
  it('delega a unarchiveBySite com siteId e id corretos', async () => {
    const fakeProduct = { id: PRODUCT_ID } as unknown as Product;
    const unarchiveBySite = jest.fn().mockResolvedValue(fakeProduct);
    const useCase = new UnarchiveProductUseCase(buildFakeRepository({ unarchiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(unarchiveBySite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID);
    expect(result).toBe(fakeProduct);
  });

  it('devolve null quando não existe ou é de outro Site', async () => {
    const unarchiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new UnarchiveProductUseCase(buildFakeRepository({ unarchiveBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID })).toBeNull();
  });
});

describe('DeleteProductUseCase', () => {
  it('delega a deleteBySite com siteId e id corretos (sucesso)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: true });
    const useCase = new DeleteProductUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(deleteBySite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID);
    expect(result).toEqual({ ok: true });
  });

  it('propaga HAS_OFFERS sem verificar Artigo (isso é responsabilidade de APP-003)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'HAS_OFFERS' });
    const useCase = new DeleteProductUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(result).toEqual({ ok: false, reason: 'HAS_OFFERS' });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new DeleteProductUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: PRODUCT_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
