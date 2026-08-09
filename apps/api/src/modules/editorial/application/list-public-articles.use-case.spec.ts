import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import { ListPublicArticlesUseCase } from './list-public-articles.use-case';

const SITE_ID = 'site-1';

function buildFakeRepository(result: { items: unknown[]; total: number }) {
  const findManyPublishedBySite = jest.fn().mockResolvedValue(result);
  const articleRepository = {
    findManyPublishedBySite,
  } as unknown as PrismaArticleRepository;

  return { articleRepository, findManyPublishedBySite };
}

describe('ListPublicArticlesUseCase', () => {
  it('repassa siteId/page/pageSize/categorySlug/type ao repository', async () => {
    const { articleRepository, findManyPublishedBySite } = buildFakeRepository({
      items: [],
      total: 0,
    });
    const useCase = new ListPublicArticlesUseCase(articleRepository);

    await useCase.execute({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      categorySlug: 'eletronicos',
      type: 'REVIEW',
    });

    expect(findManyPublishedBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      categorySlug: 'eletronicos',
      type: 'REVIEW',
    });
  });

  it('calcula totalPages a partir de total/pageSize', async () => {
    const { articleRepository } = buildFakeRepository({ items: [], total: 45 });
    const useCase = new ListPublicArticlesUseCase(articleRepository);

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(3);
  });

  it('devolve items/page/pageSize/total do repository sem transformar', async () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const { articleRepository } = buildFakeRepository({ items, total: 2 });
    const useCase = new ListPublicArticlesUseCase(articleRepository);

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.items).toBe(items);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(2);
  });
});
