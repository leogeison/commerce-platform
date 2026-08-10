import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ListPublicArticlesResponse } from '@commerce-platform/contracts';

/**
 * Mesma disciplina de `page.spec.tsx` (Home): `jest.doMock()` (não hoistado)
 * + `import()` dinâmico + `jest.resetModules()` em `afterEach`, já que
 * `jest.mock()` hoistado não funciona sob o transform SWC do `next/jest`
 * neste projeto. `connection()` é mocado pelo mesmo motivo da Home: depende
 * de contexto interno de requisição do Next.js, inexistente rodando via
 * Jest puro.
 *
 * `jest.fn<...>()` com o generic de assinatura (em vez de inferir a partir
 * de um callback) é o mesmo padrão de `compile-article-body.spec.ts`,
 * necessário para o mock ter um tipo de retorno de `toHaveBeenCalledWith`
 * compatível com o `Mock<UnknownFunction>` esperado por `jest.doMock`.
 */
describe('sitemap', () => {
  afterEach(() => {
    jest.resetModules();
  });

  type ListPublicArticlesMock = jest.Mock<
    (query: { page: number; pageSize: number }) => Promise<ListPublicArticlesResponse>
  >;

  function article(categorySlug: string, slug: string): ListPublicArticlesResponse['items'][number] {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug,
      type: 'COMPARISON',
      title: 'Título',
      slug,
      metaDescription: null,
      coverImageUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async function runSitemapWith(listPublicArticlesMock: ListPublicArticlesMock) {
    jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));
    jest.doMock('../lib/public-api/client', () => ({ listPublicArticles: listPublicArticlesMock }));

    const { default: sitemap } = await import('./sitemap');
    return sitemap();
  }

  it('gera as URLs de uma única página de artigos', async () => {
    const listPublicArticlesMock: ListPublicArticlesMock = jest.fn();
    listPublicArticlesMock.mockResolvedValue({
      items: [article('comparativos', 'fone-a'), article('comparativos', 'fone-b')],
      page: 1,
      pageSize: 100,
      total: 2,
      totalPages: 1,
    });

    const result = await runSitemapWith(listPublicArticlesMock);

    expect(listPublicArticlesMock).toHaveBeenCalledTimes(1);
    expect(listPublicArticlesMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect(result).toEqual([
      { url: 'http://localhost:3001/comparativos/fone-a' },
      { url: 'http://localhost:3001/comparativos/fone-b' },
    ]);
  });

  it('percorre múltiplas páginas e junta os itens de todas elas', async () => {
    const listPublicArticlesMock: ListPublicArticlesMock = jest.fn();
    listPublicArticlesMock.mockImplementation((query) =>
      Promise.resolve(
        query.page === 1
          ? { items: [article('comparativos', 'fone-a')], page: 1, pageSize: 100, total: 2, totalPages: 2 }
          : { items: [article('comparativos', 'fone-b')], page: 2, pageSize: 100, total: 2, totalPages: 2 },
      ),
    );

    const result = await runSitemapWith(listPublicArticlesMock);

    expect(listPublicArticlesMock).toHaveBeenCalledTimes(2);
    expect(listPublicArticlesMock).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(listPublicArticlesMock).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
    expect(result).toEqual([
      { url: 'http://localhost:3001/comparativos/fone-a' },
      { url: 'http://localhost:3001/comparativos/fone-b' },
    ]);
  });

  it('devolve lista vazia quando não há artigos publicados', async () => {
    const listPublicArticlesMock: ListPublicArticlesMock = jest.fn();
    listPublicArticlesMock.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });

    const result = await runSitemapWith(listPublicArticlesMock);

    expect(listPublicArticlesMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });
});
