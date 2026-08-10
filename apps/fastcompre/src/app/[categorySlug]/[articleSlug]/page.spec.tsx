import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicArticle } from '@commerce-platform/contracts';

/**
 * Mesma disciplina de mock das outras páginas: `jest.doMock()` + `import()`
 * dinâmico. `compile-article-body` é mockado aqui de propósito — o teste da
 * página verifica que ela passa `components={{ h1: 'h2' }}` e usa o
 * resultado corretamente, não a fidelidade real do `@mdx-js/mdx` (isso é
 * responsabilidade de `compile-article-body.spec.tsx`).
 */
describe('ArticlePage', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderArticleWith(article: PublicArticle | null): Promise<string> {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
    }));
    jest.doMock('../../../lib/public-api/client', () => ({
      getPublicArticle: jest.fn(() => Promise.resolve(article)),
    }));
    jest.doMock('./compile-article-body', () => ({
      compileArticleBody: jest.fn(() =>
        Promise.resolve(
          ({ components }: { components?: { h1?: string } }) => (
            <div data-testid="mdx-body">corpo-compilado h1={components?.h1}</div>
          ),
        ),
      ),
    }));

    const { default: ArticlePage } = await import('./page');
    const html = renderToStaticMarkup(
      await ArticlePage({
        params: Promise.resolve({ categorySlug: 'fones-bluetooth', articleSlug: 'melhor-fone' }),
      }),
    );
    return html;
  }

  it('renderiza título, aviso de afiliação, corpo compilado e produtos', async () => {
    const html = await renderArticleWith({
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug: 'fones-bluetooth',
      type: 'COMPARISON',
      title: 'Melhor fone bluetooth 2026',
      slug: 'melhor-fone',
      metaDescription: 'Comparativo dos melhores fones.',
      coverImageUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      bodyMdx: '# Introdução\n\nTexto do artigo.',
      products: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Fone A',
          description: 'Descrição do fone A.',
          imageUrl: null,
          position: 0,
          offers: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              marketplace: 'AMAZON_BR',
              price: '199.90',
              currency: 'BRL',
              inStock: true,
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              marketplace: 'MERCADO_LIVRE',
              price: '209.90',
              currency: 'BRL',
              inStock: false,
            },
          ],
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Fone B',
          description: null,
          imageUrl: null,
          position: 1,
          offers: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              marketplace: 'AMAZON_BR',
              price: '149.90',
              currency: 'BRL',
              inStock: false,
            },
          ],
        },
        {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Fone C',
          description: null,
          imageUrl: null,
          position: 2,
          offers: [],
        },
      ],
    });

    expect(html).toContain('Melhor fone bluetooth 2026');
    expect(html).toContain('links de afiliados');
    expect(html).toContain('corpo-compilado');
    expect(html).toContain('h1=h2');

    // Fone A: pelo menos uma oferta em estoque — lista normalmente, sem
    // "Temporariamente indisponível", mantendo "(indisponível)" na que
    // estiver fora de estoque.
    expect(html).toContain('Fone A');
    expect(html).toContain('199.90');

    // Fone B: todas as ofertas fora de estoque — "Temporariamente
    // indisponível" E a lista de ofertas continuam, oferta marcada.
    expect(html).toContain('Fone B');
    expect(html).toContain('149.90');

    // Fone C: nenhuma oferta — só "Temporariamente indisponível", sem lista.
    expect(html).toContain('Fone C');

    expect(html.match(/Temporariamente indisponível/g)).toHaveLength(2);
    // Uma oferta indisponível em Fone A + uma em Fone B.
    expect(html.match(/\(indisponível\)/g)).toHaveLength(2);
  });

  it('chama notFound() quando o artigo não existe', async () => {
    await expect(renderArticleWith(null)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
