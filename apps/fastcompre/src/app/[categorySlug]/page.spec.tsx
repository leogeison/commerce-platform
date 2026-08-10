import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ListPublicArticlesResponse, PublicCategory } from '@commerce-platform/contracts';

/**
 * Mesma disciplina de mock de `page.spec.tsx` da Home: `jest.doMock()` +
 * `import()` dinâmico, porque `jest.mock()` hoistado não funciona sob o
 * transform SWC do `next/jest` neste projeto.
 */
describe('CategoryPage', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderCategoryWith(
    category: PublicCategory | null,
    listResult: ListPublicArticlesResponse,
  ): Promise<string> {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
    }));
    jest.doMock('../../lib/public-api/client', () => ({
      getPublicCategory: jest.fn(() => Promise.resolve(category)),
      listPublicArticles: jest.fn(() => Promise.resolve(listResult)),
    }));

    const { default: CategoryPage } = await import('./page');
    const html = renderToStaticMarkup(
      await CategoryPage({ params: Promise.resolve({ categorySlug: 'fones-bluetooth' }) }),
    );
    return html;
  }

  it('renderiza os artigos da categoria quando ela existe e tem artigos', async () => {
    const html = await renderCategoryWith(
      { name: 'Fones bluetooth', slug: 'fones-bluetooth' },
      {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            categorySlug: 'fones-bluetooth',
            type: 'COMPARISON',
            title: 'Melhor fone bluetooth 2026',
            slug: 'melhor-fone-bluetooth',
            metaDescription: 'Comparativo dos melhores fones bluetooth.',
            coverImageUrl: 'https://example.com/cover.jpg',
            publishedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    );

    expect(html).toContain('Fones bluetooth');
    expect(html).toContain('Melhor fone bluetooth 2026');
    expect(html).toContain('/fones-bluetooth/melhor-fone-bluetooth');
    expect(html).toContain('01 de janeiro de 2026');
  });

  it('mostra estado vazio quando a categoria existe mas não tem artigos publicados', async () => {
    const html = await renderCategoryWith({ name: 'Cafeteiras', slug: 'cafeteiras' }, {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });

    expect(html).toContain('Cafeteiras');
    expect(html).toContain('Nenhum artigo publicado ainda.');
  });

  it('chama notFound() quando a categoria não existe', async () => {
    await expect(
      renderCategoryWith(null, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
