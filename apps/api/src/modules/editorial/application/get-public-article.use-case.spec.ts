import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import { GetPublicArticleUseCase } from './get-public-article.use-case';

const SITE_ID = 'site-1';
const SLUG = 'artigo-exemplo';

function buildFakeRepository(result: unknown) {
  const findOnePublishedBySite = jest.fn().mockResolvedValue(result);
  const articleRepository = {
    findOnePublishedBySite,
  } as unknown as PrismaArticleRepository;

  return { articleRepository, findOnePublishedBySite };
}

describe('GetPublicArticleUseCase', () => {
  it('repassa siteId/slug ao repository', async () => {
    const { articleRepository, findOnePublishedBySite } = buildFakeRepository(null);
    const useCase = new GetPublicArticleUseCase(articleRepository);

    await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(findOnePublishedBySite).toHaveBeenCalledWith(SITE_ID, SLUG);
  });

  it('devolve null quando o repository devolve null (não encontrado, outro Site ou não publicado)', async () => {
    const { articleRepository } = buildFakeRepository(null);
    const useCase = new GetPublicArticleUseCase(articleRepository);

    const result = await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(result).toBeNull();
  });

  it('devolve exatamente o que o repository devolveu, sem transformar', async () => {
    const article = { id: 'article-1', slug: SLUG };
    const { articleRepository } = buildFakeRepository(article);
    const useCase = new GetPublicArticleUseCase(articleRepository);

    const result = await useCase.execute({ siteId: SITE_ID, slug: SLUG });

    expect(result).toBe(article);
  });
});
