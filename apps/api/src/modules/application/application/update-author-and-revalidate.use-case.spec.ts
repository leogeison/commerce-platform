import { UpdateAuthorAndRevalidateUseCase } from './update-author-and-revalidate.use-case';
import type {
  UpdateAuthorUseCase,
  UpdateAuthorResult,
} from '../../editorial/application/update-author.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Author } from '../../../generated/prisma/client';

describe('UpdateAuthorAndRevalidateUseCase', () => {
  function build(updateResult: UpdateAuthorResult) {
    const updateAuthorUseCase = {
      execute: jest.fn().mockResolvedValue(updateResult),
    } as unknown as jest.Mocked<UpdateAuthorUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForAuthor: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new UpdateAuthorAndRevalidateUseCase(
      updateAuthorUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, updateAuthorUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    authorId: 'author-1',
    name: 'Ana',
    bio: 'Bio da Ana',
    avatarUrl: 'https://example.com/ana.png',
    userId: 'user-1',
  };

  it('NOT_FOUND: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, updateAuthorUseCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(updateAuthorUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      id: 'author-1',
      name: 'Ana',
      bio: 'Bio da Ana',
      avatarUrl: 'https://example.com/ana.png',
      userId: 'user-1',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(revalidateAffectedArticlesUseCase.revalidateForAuthor).not.toHaveBeenCalled();
  });

  it('USER_ALREADY_HAS_AUTHOR: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'USER_ALREADY_HAS_AUTHOR',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' });
    expect(revalidateAffectedArticlesUseCase.revalidateForAuthor).not.toHaveBeenCalled();
  });

  it('USER_NOT_FOUND: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'USER_NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'USER_NOT_FOUND' });
    expect(revalidateAffectedArticlesUseCase.revalidateForAuthor).not.toHaveBeenCalled();
  });

  it('atualização bem-sucedida: aciona REV-005 com siteId/siteSlug/authorId corretos e devolve o Author atualizado', async () => {
    const author = { id: 'author-1', name: 'Ana' } as Author;
    const { useCase, revalidateAffectedArticlesUseCase } = build({ ok: true, author });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, author });
    expect(revalidateAffectedArticlesUseCase.revalidateForAuthor).toHaveBeenCalledTimes(1);
    expect(revalidateAffectedArticlesUseCase.revalidateForAuthor).toHaveBeenCalledWith({
      siteId: 'site-1',
      siteSlug: 'fastcompre',
      authorId: 'author-1',
    });
  });
});
