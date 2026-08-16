import type { Author } from '../../../generated/prisma/client';
import type { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import { CreateAuthorUseCase } from './create-author.use-case';
import { GetAuthorUseCase } from './get-author.use-case';
import { ListAuthorsUseCase } from './list-authors.use-case';
import { DeleteAuthorUseCase } from './delete-author.use-case';

/**
 * QA-001 — mesmo critério dos specs de Categoria/Produto/Oferta, aplicado
 * aos 4 casos de uso de Autor que só delegam ao repository (EDT-001/002/
 * 003/005). Diferente de Categoria/Produto/Oferta, `DeleteAuthorUseCase`
 * tem controller HTTP próprio (Author só é referenciado por Article, mesmo
 * domínio — sem a razão cross-domain que tornou CAT-007/014/021 internas),
 * mas o caso de uso em si continua sendo só delegação.
 */
const SITE_ID = 'site-1';
const AUTHOR_ID = 'author-1';

function buildFakeRepository(methods: Partial<Record<keyof PrismaAuthorRepository, jest.Mock>>) {
  return methods as unknown as PrismaAuthorRepository;
}

describe('CreateAuthorUseCase', () => {
  it('delega ao repository e devolve o resultado tal como recebido (sucesso)', async () => {
    const fakeAuthor = { id: AUTHOR_ID, name: 'Maria' } as unknown as Author;
    const create = jest.fn().mockResolvedValue({ ok: true, author: fakeAuthor });
    const useCase = new CreateAuthorUseCase(buildFakeRepository({ create }));

    const input = { siteId: SITE_ID, name: 'Maria' };
    const result = await useCase.execute(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, author: fakeAuthor });
  });

  it('propaga USER_ALREADY_HAS_AUTHOR sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' });
    const useCase = new CreateAuthorUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({ siteId: SITE_ID, name: 'Maria', userId: 'user-1' });

    expect(result).toEqual({ ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' });
  });

  it('propaga USER_NOT_FOUND sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'USER_NOT_FOUND' });
    const useCase = new CreateAuthorUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({ siteId: SITE_ID, name: 'Maria', userId: 'user-inexistente' });

    expect(result).toEqual({ ok: false, reason: 'USER_NOT_FOUND' });
  });
});

describe('GetAuthorUseCase', () => {
  it('delega a findOneBySite com siteId e id corretos', async () => {
    const fakeAuthor = { id: AUTHOR_ID } as unknown as Author;
    const findOneBySite = jest.fn().mockResolvedValue(fakeAuthor);
    const useCase = new GetAuthorUseCase(buildFakeRepository({ findOneBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID });

    expect(findOneBySite).toHaveBeenCalledWith(SITE_ID, AUTHOR_ID);
    expect(result).toBe(fakeAuthor);
  });

  it('devolve null quando não encontra', async () => {
    const findOneBySite = jest.fn().mockResolvedValue(null);
    const useCase = new GetAuthorUseCase(buildFakeRepository({ findOneBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID })).toBeNull();
  });
});

describe('ListAuthorsUseCase', () => {
  it('delega findManyBySite e calcula totalPages a partir do total devolvido', async () => {
    const items = [{ id: AUTHOR_ID }] as unknown as Author[];
    const findManyBySite = jest.fn().mockResolvedValue({ items, total: 21 });
    const useCase = new ListAuthorsUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 2, pageSize: 10 });

    expect(findManyBySite).toHaveBeenCalledWith({ siteId: SITE_ID, page: 2, pageSize: 10 });
    expect(result).toEqual({ items, page: 2, pageSize: 10, total: 21, totalPages: 3 });
  });

  it('total 0 resulta em totalPages 0', async () => {
    const findManyBySite = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = new ListAuthorsUseCase(buildFakeRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(0);
  });
});

describe('DeleteAuthorUseCase', () => {
  it('delega a deleteBySite com siteId e id corretos (sucesso)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: true });
    const useCase = new DeleteAuthorUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID });

    expect(deleteBySite).toHaveBeenCalledWith(SITE_ID, AUTHOR_ID);
    expect(result).toEqual({ ok: true });
  });

  it('propaga HAS_ARTICLES sem alterar o resultado', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'HAS_ARTICLES' });
    const useCase = new DeleteAuthorUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID });

    expect(result).toEqual({ ok: false, reason: 'HAS_ARTICLES' });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new DeleteAuthorUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
