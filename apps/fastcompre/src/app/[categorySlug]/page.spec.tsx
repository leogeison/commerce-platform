import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ListPublicArticlesResponse, PublicCategory } from '@commerce-platform/contracts';

/**
 * Mesma disciplina de mock de `page.spec.tsx` da Home: `jest.doMock()` +
 * `import()` dinâmico, porque `jest.mock()` hoistado não funciona sob o
 * transform SWC do `next/jest` neste projeto. `jest.resetModules()` a cada
 * teste garante que o novo `doMock` valha para a próxima importação, não
 * para uma já cacheada.
 */
describe('CategoryPage', () => {
  afterEach(() => {
    jest.resetModules();
  });

  function mockCategoryDependencies(
    category: PublicCategory | null,
    listResult: ListPublicArticlesResponse,
  ) {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
    }));
    jest.doMock('../../lib/public-api/client', () => ({
      getPublicCategory: jest.fn(() => Promise.resolve(category)),
      listPublicArticles: jest.fn(() => Promise.resolve(listResult)),
    }));
  }

  async function renderCategoryWith(
    category: PublicCategory | null,
    listResult: ListPublicArticlesResponse,
  ): Promise<string> {
    mockCategoryDependencies(category, listResult);

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
    // UXW-008: copy do estado vazio passou a ser específica desta rota
    // ("nesta categoria"), em vez do texto genérico compartilhado com a
    // Home — mais preciso, sem depender de nenhum dado novo.
    expect(html).toContain('Nenhum artigo publicado nesta categoria ainda.');
  });

  it('chama notFound() quando a categoria não existe', async () => {
    await expect(
      renderCategoryWith(null, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  /**
   * Correção de LCP (UXW-006) — mesma regra e mesmos casos de
   * `apps/fastcompre/src/app/(home)/page.spec.tsx`, aplicados a esta rota (o
   * bloco de listagem é duplicado entre as duas, não compartilhado).
   * Preservada sem alteração de lógica pela UXW-008 — só o markup ao redor
   * do `<img>` mudou (ver `page.tsx`).
   */
  describe('prioridade de carregamento da imagem LCP', () => {
    function article(overrides: {
      id: string;
      title: string;
      coverImageUrl: string | null;
    }) {
      return {
        id: overrides.id,
        categorySlug: 'fones-bluetooth',
        type: 'COMPARISON' as const,
        title: overrides.title,
        slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
        metaDescription: null,
        coverImageUrl: overrides.coverImageUrl,
        publishedAt: '2026-01-01T00:00:00.000Z',
      };
    }

    function extractImgTags(html: string): string[] {
      return html.match(/<img[^>]*>/g) ?? [];
    }

    it('aplica loading="eager" e fetchpriority="high" somente na primeira imagem, mantendo as demais lazy e sem prioridade', async () => {
      const html = await renderCategoryWith(
        { name: 'Fones bluetooth', slug: 'fones-bluetooth' },
        {
          items: [
            article({ id: '1', title: 'Primeiro artigo', coverImageUrl: 'https://example.com/1.jpg' }),
            article({ id: '2', title: 'Segundo artigo', coverImageUrl: 'https://example.com/2.jpg' }),
            article({ id: '3', title: 'Terceiro artigo', coverImageUrl: 'https://example.com/3.jpg' }),
          ],
          page: 1,
          pageSize: 20,
          total: 3,
          totalPages: 1,
        },
      );

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(3);

      expect(imgTags[0]).toContain('src="https://example.com/1.jpg"');
      expect(imgTags[0]).toContain('loading="eager"');
      expect(imgTags[0]).toContain('fetchPriority="high"');

      for (const tag of imgTags.slice(1)) {
        expect(tag).toContain('loading="lazy"');
        expect(tag).not.toContain('fetchPriority');
      }
    });

    it('aplica a prioridade na primeira imagem REAL quando o primeiro artigo da lista não tem coverImageUrl', async () => {
      const html = await renderCategoryWith(
        { name: 'Fones bluetooth', slug: 'fones-bluetooth' },
        {
          items: [
            article({ id: '1', title: 'Sem imagem', coverImageUrl: null }),
            article({ id: '2', title: 'Com imagem', coverImageUrl: 'https://example.com/2.jpg' }),
          ],
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      );

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(1);
      expect(imgTags[0]).toContain('src="https://example.com/2.jpg"');
      expect(imgTags[0]).toContain('loading="eager"');
      expect(imgTags[0]).toContain('fetchPriority="high"');
    });

    it('preserva o comportamento atual quando nenhum artigo tem coverImageUrl (nenhuma imagem, nenhum crash)', async () => {
      const html = await renderCategoryWith(
        { name: 'Fones bluetooth', slug: 'fones-bluetooth' },
        {
          items: [
            article({ id: '1', title: 'Sem imagem 1', coverImageUrl: null }),
            article({ id: '2', title: 'Sem imagem 2', coverImageUrl: null }),
          ],
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      );

      expect(extractImgTags(html)).toHaveLength(0);
      expect(html).toContain('Sem imagem 1');
      expect(html).toContain('Sem imagem 2');
    });
  });

  /**
   * UXW-008, ajuste explicitamente pedido nesta implementação (mesmo padrão
   * já fechado para a Home em UXW-007): gate de acessibilidade (`jest-axe`)
   * com a Categoria populada por cards reais (com e sem imagem), exercitando
   * o markup novo (`<article>`, `alt=""`, link do card inteiro com
   * `focus-visible`/`ring-focus`) — não só o caminho vazio/404, que não
   * cobre o card em si. `render()`/Testing Library aqui (não
   * `renderToStaticMarkup`): `jest-axe` precisa de um container DOM real
   * para analisar, e `CategoryPage` chamado diretamente (`await
   * CategoryPage({ params })`) devolve um elemento React de verdade,
   * montável via `render()` — mesma técnica de `page.spec.tsx` da Home.
   */
  describe('acessibilidade (jest-axe) — Categoria populada', () => {
    it('não tem violação de acessibilidade com cards com e sem imagem', async () => {
      mockCategoryDependencies(
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
            {
              id: '22222222-2222-4222-8222-222222222222',
              categorySlug: 'fones-bluetooth',
              type: 'COMPARISON',
              title: 'Fone bluetooth custo-benefício',
              slug: 'fone-bluetooth-custo-beneficio',
              metaDescription: null,
              coverImageUrl: null,
              publishedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      );

      const { default: CategoryPage } = await import('./page');
      const page = await CategoryPage({
        params: Promise.resolve({ categorySlug: 'fones-bluetooth' }),
      });
      const { container } = render(page);

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
