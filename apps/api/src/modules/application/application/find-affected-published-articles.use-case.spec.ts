import type { Article } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { FindAffectedPublishedArticlesUseCase } from './find-affected-published-articles.use-case';

/**
 * QA-001 — os 4 métodos deste caso de uso (APP-005) são delegação pura para
 * `PrismaArticleRepository`, um por entidade (Categoria/Autor/Produto/
 * Oferta) — mesmo critério dos demais specs de passthrough deste bloco.
 * O filtro real (`siteId` + `status: PUBLISHED` + travessia de relação) já
 * vive no repository, coberto por `find-affected-published-articles.e2e-spec.ts`.
 */
const SITE_ID = 'site-1';

function buildFakeRepository(methods: Partial<Record<keyof PrismaArticleRepository, jest.Mock>>) {
  return methods as unknown as PrismaArticleRepository;
}

describe('FindAffectedPublishedArticlesUseCase', () => {
  it('findByCategory delega a findPublishedByCategory com siteId e categoryId corretos', async () => {
    const articles = [{ id: 'article-1' }] as unknown as Article[];
    const findPublishedByCategory = jest.fn().mockResolvedValue(articles);
    const useCase = new FindAffectedPublishedArticlesUseCase(
      buildFakeRepository({ findPublishedByCategory }),
    );

    const result = await useCase.findByCategory(SITE_ID, 'category-1');

    expect(findPublishedByCategory).toHaveBeenCalledWith(SITE_ID, 'category-1');
    expect(result).toBe(articles);
  });

  it('findByAuthor delega a findPublishedByAuthor com siteId e authorId corretos', async () => {
    const articles = [{ id: 'article-1' }] as unknown as Article[];
    const findPublishedByAuthor = jest.fn().mockResolvedValue(articles);
    const useCase = new FindAffectedPublishedArticlesUseCase(
      buildFakeRepository({ findPublishedByAuthor }),
    );

    const result = await useCase.findByAuthor(SITE_ID, 'author-1');

    expect(findPublishedByAuthor).toHaveBeenCalledWith(SITE_ID, 'author-1');
    expect(result).toBe(articles);
  });

  it('findByProduct delega a findPublishedByProduct com siteId e productId corretos', async () => {
    const articles = [{ id: 'article-1' }] as unknown as Article[];
    const findPublishedByProduct = jest.fn().mockResolvedValue(articles);
    const useCase = new FindAffectedPublishedArticlesUseCase(
      buildFakeRepository({ findPublishedByProduct }),
    );

    const result = await useCase.findByProduct(SITE_ID, 'product-1');

    expect(findPublishedByProduct).toHaveBeenCalledWith(SITE_ID, 'product-1');
    expect(result).toBe(articles);
  });

  it('findByOffer delega a findPublishedByOffer com siteId e offerId corretos, devolvendo [] quando não há Artigos afetados', async () => {
    const findPublishedByOffer = jest.fn().mockResolvedValue([]);
    const useCase = new FindAffectedPublishedArticlesUseCase(
      buildFakeRepository({ findPublishedByOffer }),
    );

    const result = await useCase.findByOffer(SITE_ID, 'offer-1');

    expect(findPublishedByOffer).toHaveBeenCalledWith(SITE_ID, 'offer-1');
    expect(result).toEqual([]);
  });
});
