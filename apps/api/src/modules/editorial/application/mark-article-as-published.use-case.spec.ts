import type { Article } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import { MarkArticleAsPublishedUseCase } from './mark-article-as-published.use-case';

const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';

function buildFakeRepository(result: unknown) {
  const markAsPublished = jest.fn().mockResolvedValue(result);
  const repository = { markAsPublished } as unknown as PrismaArticleRepository;

  return { repository, markAsPublished };
}

describe('MarkArticleAsPublishedUseCase', () => {
  it('delega ao repository com siteId e id, e devolve o resultado tal como recebido', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'PUBLISHED' } as unknown as Article;
    const { repository, markAsPublished } = buildFakeRepository({ ok: true, article: fakeArticle });
    const useCase = new MarkArticleAsPublishedUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(markAsPublished).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new MarkArticleAsPublishedUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('propaga WRONG_STATUS sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'WRONG_STATUS' });
    const useCase = new MarkArticleAsPublishedUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'WRONG_STATUS' });
  });
});
