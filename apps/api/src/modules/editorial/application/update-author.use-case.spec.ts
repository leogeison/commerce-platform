import type { Author } from '../../../generated/prisma/client';
import type { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import { UpdateAuthorUseCase } from './update-author.use-case';

const SITE_ID = 'site-1';
const AUTHOR_ID = 'author-1';

function buildFakeRepository(result: unknown) {
  const updateBySite = jest.fn().mockResolvedValue(result);
  const repository = { updateBySite } as unknown as PrismaAuthorRepository;

  return { repository, updateBySite };
}

describe('UpdateAuthorUseCase', () => {
  it('delega ao repository com siteId, id e todos os campos, e devolve o resultado tal como recebido', async () => {
    const fakeAuthor = { id: AUTHOR_ID, name: 'Ana' } as unknown as Author;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, author: fakeAuthor });
    const useCase = new UpdateAuthorUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      id: AUTHOR_ID,
      name: 'Ana',
      bio: 'Bio da Ana',
      avatarUrl: 'https://example.com/ana.png',
      userId: 'user-1',
    });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: AUTHOR_ID,
      name: 'Ana',
      bio: 'Bio da Ana',
      avatarUrl: 'https://example.com/ana.png',
      userId: 'user-1',
    });
    expect(result).toEqual({ ok: true, author: fakeAuthor });
  });

  it('repassa campos omitidos como undefined (PATCH parcial)', async () => {
    const fakeAuthor = { id: AUTHOR_ID } as unknown as Author;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, author: fakeAuthor });
    const useCase = new UpdateAuthorUseCase(repository);

    await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: AUTHOR_ID,
      name: undefined,
      bio: undefined,
      avatarUrl: undefined,
      userId: undefined,
    });
  });

  it('repassa userId: null explicitamente (remove vínculo com User)', async () => {
    const fakeAuthor = { id: AUTHOR_ID, userId: null } as unknown as Author;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, author: fakeAuthor });
    const useCase = new UpdateAuthorUseCase(repository);

    await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID, userId: null });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      id: AUTHOR_ID,
      name: undefined,
      bio: undefined,
      avatarUrl: undefined,
      userId: null,
    });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new UpdateAuthorUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID, name: 'Ana' });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('propaga USER_ALREADY_HAS_AUTHOR sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' });
    const useCase = new UpdateAuthorUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID, userId: 'user-2' });

    expect(result).toEqual({ ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' });
  });

  it('propaga USER_NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'USER_NOT_FOUND' });
    const useCase = new UpdateAuthorUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: AUTHOR_ID, userId: 'user-3' });

    expect(result).toEqual({ ok: false, reason: 'USER_NOT_FOUND' });
  });
});
