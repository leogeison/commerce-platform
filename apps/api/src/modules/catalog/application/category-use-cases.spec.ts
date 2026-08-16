import type { Category } from '../../../generated/prisma/client';
import type { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import { CreateCategoryUseCase } from './create-category.use-case';
import { GetCategoryUseCase } from './get-category.use-case';
import { ListCategoriesUseCase } from './list-categories.use-case';
import { ArchiveCategoryUseCase } from './archive-category.use-case';
import { UnarchiveCategoryUseCase } from './unarchive-category.use-case';
import { DeleteCategoryUseCase } from './delete-category.use-case';

/**
 * QA-001 — teste unitário enxuto dos 6 casos de uso de Categoria que hoje só
 * delegam ao repository (CAT-001/002/003/005/006/007), sem controller/rota
 * própria (exceto CAT-002/003, que têm controller de leitura). Cada teste
 * confirma: método certo do repository chamado com os argumentos certos, e
 * o retorno do caso de uso é exatamente o que o repository devolveu — nunca
 * transformado. Comportamento real (slug único por Site, `HAS_PRODUCTS`,
 * idempotência de archive/unarchive) já é coberto pelos e2e correspondentes
 * (`create-category`, `list-categories`, `get-category`, `archive-category`,
 * `unarchive-category`, `delete-category`) — este spec só prova que o caso
 * de uso roteia certo para o repository, sem reimplementar essa cobertura.
 */
const SITE_ID = 'site-1';
const CATEGORY_ID = 'category-1';

function buildFakeRepository(methods: Partial<Record<keyof PrismaCategoryRepository, jest.Mock>>) {
  return methods as unknown as PrismaCategoryRepository;
}

describe('CreateCategoryUseCase', () => {
  it('delega ao repository e devolve o resultado tal como recebido (sucesso)', async () => {
    const fakeCategory = { id: CATEGORY_ID, name: 'Fones', slug: 'fones' } as unknown as Category;
    const create = jest.fn().mockResolvedValue({ ok: true, category: fakeCategory });
    const useCase = new CreateCategoryUseCase(buildFakeRepository({ create }));

    const input = { siteId: SITE_ID, name: 'Fones', slug: 'fones' };
    const result = await useCase.execute(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, category: fakeCategory });
  });

  it('propaga SLUG_CONFLICT sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'SLUG_CONFLICT' });
    const useCase = new CreateCategoryUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({ siteId: SITE_ID, name: 'Fones', slug: 'fones' });

    expect(result).toEqual({ ok: false, reason: 'SLUG_CONFLICT' });
  });
});

describe('GetCategoryUseCase', () => {
  it('delega a findOneBySite com siteId e id corretos', async () => {
    const fakeCategory = { id: CATEGORY_ID } as unknown as Category;
    const findOneBySite = jest.fn().mockResolvedValue(fakeCategory);
    const useCase = new GetCategoryUseCase(buildFakeRepository({ findOneBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(findOneBySite).toHaveBeenCalledWith(SITE_ID, CATEGORY_ID);
    expect(result).toBe(fakeCategory);
  });

  it('devolve null quando o repository não encontra (não existe ou é de outro Site)', async () => {
    const findOneBySite = jest.fn().mockResolvedValue(null);
    const useCase = new GetCategoryUseCase(buildFakeRepository({ findOneBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(result).toBeNull();
  });
});

describe('ListCategoriesUseCase', () => {
  it('delega findManyBySite e calcula totalPages a partir do total devolvido', async () => {
    const items = [{ id: CATEGORY_ID }] as unknown as Category[];
    const findManyBySite = jest.fn().mockResolvedValue({ items, total: 21 });
    const useCase = new ListCategoriesUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 2, pageSize: 10, archived: false });

    expect(findManyBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      archived: false,
    });
    expect(result).toEqual({ items, page: 2, pageSize: 10, total: 21, totalPages: 3 });
  });

  it('total 0 resulta em totalPages 0 (nunca NaN)', async () => {
    const findManyBySite = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = new ListCategoriesUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(0);
  });
});

describe('ArchiveCategoryUseCase', () => {
  it('delega a archiveBySite com siteId e id corretos', async () => {
    const fakeCategory = { id: CATEGORY_ID, archivedAt: new Date() } as unknown as Category;
    const archiveBySite = jest.fn().mockResolvedValue(fakeCategory);
    const useCase = new ArchiveCategoryUseCase(buildFakeRepository({ archiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(archiveBySite).toHaveBeenCalledWith(SITE_ID, CATEGORY_ID);
    expect(result).toBe(fakeCategory);
  });

  it('devolve null quando não existe ou é de outro Site', async () => {
    const archiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new ArchiveCategoryUseCase(buildFakeRepository({ archiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(result).toBeNull();
  });
});

describe('UnarchiveCategoryUseCase', () => {
  it('delega a unarchiveBySite com siteId e id corretos', async () => {
    const fakeCategory = { id: CATEGORY_ID, archivedAt: null } as unknown as Category;
    const unarchiveBySite = jest.fn().mockResolvedValue(fakeCategory);
    const useCase = new UnarchiveCategoryUseCase(buildFakeRepository({ unarchiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(unarchiveBySite).toHaveBeenCalledWith(SITE_ID, CATEGORY_ID);
    expect(result).toBe(fakeCategory);
  });

  it('devolve null quando não existe ou é de outro Site', async () => {
    const unarchiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new UnarchiveCategoryUseCase(buildFakeRepository({ unarchiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(result).toBeNull();
  });
});

describe('DeleteCategoryUseCase', () => {
  it('delega a deleteBySite com siteId e id corretos (sucesso)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: true });
    const useCase = new DeleteCategoryUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(deleteBySite).toHaveBeenCalledWith(SITE_ID, CATEGORY_ID);
    expect(result).toEqual({ ok: true });
  });

  it('propaga HAS_PRODUCTS sem verificar Artigo (isso é responsabilidade de APP-006)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'HAS_PRODUCTS' });
    const useCase = new DeleteCategoryUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(result).toEqual({ ok: false, reason: 'HAS_PRODUCTS' });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new DeleteCategoryUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: CATEGORY_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
