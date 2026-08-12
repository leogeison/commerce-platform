import type { Article } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import { ArchiveArticleUseCase } from './archive-article.use-case';

const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';

function buildFakeRepository(result: unknown) {
  const archive = jest.fn().mockResolvedValue(result);
  const repository = { archive } as unknown as PrismaArticleRepository;

  return { repository, archive };
}

describe('ArchiveArticleUseCase', () => {
  it('delega ao repository com siteId e id, e devolve o resultado tal como recebido', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'ARCHIVED' } as unknown as Article;
    const { repository, archive } = buildFakeRepository({ ok: true, article: fakeArticle });
    const useCase = new ArchiveArticleUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(archive).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new ArchiveArticleUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('propaga WRONG_STATUS sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'WRONG_STATUS' });
    const useCase = new ArchiveArticleUseCase(repository);

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'WRONG_STATUS' });
  });
});
