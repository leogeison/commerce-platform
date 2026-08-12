import { Logger } from '@nestjs/common';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { FindAffectedPublishedArticlesUseCase } from './find-affected-published-articles.use-case';
import type { RevalidationPort } from '../../revalidation/domain/revalidation.port';
import type { Article } from '../../../generated/prisma/client';

function build() {
  const findAffectedPublishedArticlesUseCase = {
    findByCategory: jest.fn(),
    findByAuthor: jest.fn(),
    findByProduct: jest.fn(),
    findByOffer: jest.fn(),
  } as unknown as jest.Mocked<FindAffectedPublishedArticlesUseCase>;

  const revalidationPort: jest.Mocked<RevalidationPort> = {
    revalidate: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new RevalidateAffectedArticlesUseCase(
    findAffectedPublishedArticlesUseCase,
    revalidationPort,
  );

  return { useCase, findAffectedPublishedArticlesUseCase, revalidationPort };
}

describe('RevalidateAffectedArticlesUseCase', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('revalidateForCategory', () => {
    const input = { siteId: 'site-1', siteSlug: 'fastcompre', categoryId: 'category-1' };

    it('zero Artigos afetados: nenhuma chamada de revalidação, resolve normalmente', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockResolvedValue([]);

      await expect(useCase.revalidateForCategory(input)).resolves.toBeUndefined();

      expect(findAffectedPublishedArticlesUseCase.findByCategory).toHaveBeenCalledWith(
        'site-1',
        'category-1',
      );
      expect(revalidationPort.revalidate).not.toHaveBeenCalled();
    });

    it('um Artigo afetado: uma chamada de revalidação com siteSlug/articleSlug corretos', async () => {
      const article = { id: 'article-1', slug: 'artigo-1' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockResolvedValue([article]);

      await useCase.revalidateForCategory(input);

      expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
      expect(revalidationPort.revalidate).toHaveBeenCalledWith({
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-1',
      });
    });

    it('N Artigos afetados com uma falha isolada no meio: tenta todos sequencialmente, não propaga, resolve normalmente', async () => {
      const articleA = { id: 'article-a', slug: 'artigo-a' } as Article;
      const articleB = { id: 'article-b', slug: 'artigo-b' } as Article;
      const articleC = { id: 'article-c', slug: 'artigo-c' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockResolvedValue([
        articleA,
        articleB,
        articleC,
      ]);
      revalidationPort.revalidate.mockImplementation(async ({ articleSlug }) => {
        if (articleSlug === 'artigo-b') {
          throw new Error('revalidação indisponível');
        }
      });

      await expect(useCase.revalidateForCategory(input)).resolves.toBeUndefined();

      expect(revalidationPort.revalidate).toHaveBeenCalledTimes(3);
      expect(revalidationPort.revalidate).toHaveBeenNthCalledWith(1, {
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-a',
      });
      expect(revalidationPort.revalidate).toHaveBeenNthCalledWith(2, {
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-b',
      });
      expect(revalidationPort.revalidate).toHaveBeenNthCalledWith(3, {
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-c',
      });
    });

    it('falha isolada de revalidação de um Artigo: loga em nível error com affectedArticleIds contendo somente o Artigo daquela tentativa (REV-015, Architecture.md §21)', async () => {
      const articleA = { id: 'article-a', slug: 'artigo-a' } as Article;
      const articleB = { id: 'article-b', slug: 'artigo-b' } as Article;
      const articleC = { id: 'article-c', slug: 'artigo-c' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockResolvedValue([
        articleA,
        articleB,
        articleC,
      ]);
      revalidationPort.revalidate.mockImplementation(async ({ articleSlug }) => {
        if (articleSlug === 'artigo-b') {
          throw new Error('revalidação indisponível');
        }
      });

      await useCase.revalidateForCategory(input);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        {
          siteId: 'site-1',
          resource: 'category',
          resourceId: 'category-1',
          affectedArticleIds: ['article-b'],
          error: 'revalidação indisponível',
        },
        'Falha ao revalidar cache após alteração em dependência do Artigo.',
      );
    });

    it('falha na descoberta via APP-005: nenhuma chamada de revalidação, não propaga, resolve normalmente', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockRejectedValue(
        new Error('Postgres indisponível'),
      );

      await expect(useCase.revalidateForCategory(input)).resolves.toBeUndefined();

      expect(revalidationPort.revalidate).not.toHaveBeenCalled();
    });

    it('falha na descoberta via APP-005: loga em nível error sem affectedArticleIds — Artigos afetados são desconhecidos, não uma lista vazia (REV-015, Architecture.md §21)', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase } = build();
      findAffectedPublishedArticlesUseCase.findByCategory.mockRejectedValue(
        new Error('Postgres indisponível'),
      );

      await useCase.revalidateForCategory(input);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        {
          siteId: 'site-1',
          resource: 'category',
          resourceId: 'category-1',
          error: 'Postgres indisponível',
        },
        'Falha ao descobrir Artigos publicados afetados para revalidação.',
      );
    });
  });

  describe('revalidateForAuthor', () => {
    const input = { siteId: 'site-1', siteSlug: 'fastcompre', authorId: 'author-1' };

    it('delega a findByAuthor com o authorId correto e revalida o Artigo retornado', async () => {
      const article = { id: 'article-1', slug: 'artigo-autor' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByAuthor.mockResolvedValue([article]);

      await useCase.revalidateForAuthor(input);

      expect(findAffectedPublishedArticlesUseCase.findByAuthor).toHaveBeenCalledWith(
        'site-1',
        'author-1',
      );
      expect(revalidationPort.revalidate).toHaveBeenCalledWith({
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-autor',
      });
    });

    it('falha na descoberta: nenhuma chamada de revalidação, não propaga', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByAuthor.mockRejectedValue(new Error('falha'));

      await expect(useCase.revalidateForAuthor(input)).resolves.toBeUndefined();
      expect(revalidationPort.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('revalidateForProduct', () => {
    const input = { siteId: 'site-1', siteSlug: 'fastcompre', productId: 'product-1' };

    it('delega a findByProduct com o productId correto e revalida o Artigo retornado', async () => {
      const article = { id: 'article-1', slug: 'artigo-produto' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByProduct.mockResolvedValue([article]);

      await useCase.revalidateForProduct(input);

      expect(findAffectedPublishedArticlesUseCase.findByProduct).toHaveBeenCalledWith(
        'site-1',
        'product-1',
      );
      expect(revalidationPort.revalidate).toHaveBeenCalledWith({
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-produto',
      });
    });

    it('falha na descoberta: nenhuma chamada de revalidação, não propaga', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByProduct.mockRejectedValue(new Error('falha'));

      await expect(useCase.revalidateForProduct(input)).resolves.toBeUndefined();
      expect(revalidationPort.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('revalidateForOffer', () => {
    const input = { siteId: 'site-1', siteSlug: 'fastcompre', offerId: 'offer-1' };

    it('delega a findByOffer com o offerId correto e revalida o Artigo retornado', async () => {
      const article = { id: 'article-1', slug: 'artigo-oferta' } as Article;
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByOffer.mockResolvedValue([article]);

      await useCase.revalidateForOffer(input);

      expect(findAffectedPublishedArticlesUseCase.findByOffer).toHaveBeenCalledWith(
        'site-1',
        'offer-1',
      );
      expect(revalidationPort.revalidate).toHaveBeenCalledWith({
        siteSlug: 'fastcompre',
        articleSlug: 'artigo-oferta',
      });
    });

    it('falha na descoberta: nenhuma chamada de revalidação, não propaga', async () => {
      const { useCase, findAffectedPublishedArticlesUseCase, revalidationPort } = build();
      findAffectedPublishedArticlesUseCase.findByOffer.mockRejectedValue(new Error('falha'));

      await expect(useCase.revalidateForOffer(input)).resolves.toBeUndefined();
      expect(revalidationPort.revalidate).not.toHaveBeenCalled();
    });
  });
});
