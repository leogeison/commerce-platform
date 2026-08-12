import { Logger } from '@nestjs/common';
import { ArchiveArticleAndRevalidateUseCase } from './archive-article-and-revalidate.use-case';
import type { ArchiveArticleUseCase, ArchiveArticleResult } from '../../editorial/application/archive-article.use-case';
import type { RevalidationPort } from '../../revalidation/domain/revalidation.port';
import type { Article } from '../../../generated/prisma/client';

describe('ArchiveArticleAndRevalidateUseCase', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function build(archiveResult: ArchiveArticleResult) {
    const archiveArticleUseCase = {
      execute: jest.fn().mockResolvedValue(archiveResult),
    } as unknown as jest.Mocked<ArchiveArticleUseCase>;

    const revalidationPort: jest.Mocked<RevalidationPort> = {
      revalidate: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new ArchiveArticleAndRevalidateUseCase(
      archiveArticleUseCase,
      revalidationPort,
    );

    return { useCase, archiveArticleUseCase, revalidationPort };
  }

  const input = { siteId: 'site-1', siteSlug: 'fastcompre', articleId: 'article-1' };

  it('artigo não encontrado: não chama revalidação, devolve o resultado como veio', async () => {
    const { useCase, revalidationPort } = build({ ok: false, reason: 'NOT_FOUND' });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('status diferente de PUBLISHED: não chama revalidação, devolve o resultado como veio', async () => {
    const { useCase, revalidationPort } = build({ ok: false, reason: 'WRONG_STATUS' });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: false, reason: 'WRONG_STATUS' });
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('arquivamento bem-sucedido com revalidação bem-sucedida: chama a porta com siteSlug/articleSlug e devolve o artigo arquivado', async () => {
    const article = { id: 'article-1', slug: 'artigo-arquivado' } as Article;
    const { useCase, revalidationPort } = build({ ok: true, article });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, article });
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: 'fastcompre',
      articleSlug: 'artigo-arquivado',
    });
  });

  it('arquivamento bem-sucedido com revalidação falhando: ainda devolve sucesso, sem propagar o erro', async () => {
    const article = { id: 'article-1', slug: 'artigo-arquivado' } as Article;
    const { useCase, revalidationPort } = build({ ok: true, article });
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, article });
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('arquivamento bem-sucedido com revalidação falhando: loga em nível error com o payload estruturado exigido por REV-015 (Architecture.md §21)', async () => {
    const article = { id: 'article-1', slug: 'artigo-arquivado' } as Article;
    const { useCase, revalidationPort } = build({ ok: true, article });
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));

    await useCase.execute(input);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        siteId: 'site-1',
        resource: 'article',
        resourceId: 'article-1',
        affectedArticleIds: ['article-1'],
        error: 'revalidação indisponível',
      },
      'Falha ao revalidar cache após arquivar Artigo.',
    );
  });
});
