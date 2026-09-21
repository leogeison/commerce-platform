import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicArticle } from '@commerce-platform/contracts';

/**
 * Mesma disciplina de mock das outras páginas: `jest.doMock()` + `import()`
 * dinâmico. `compile-article-body` é mockado aqui de propósito — a
 * fidelidade real do `@mdx-js/mdx` é responsabilidade de
 * `compile-article-body.spec.ts`, não deste arquivo.
 *
 * UXW-009: o mock passou a EXERCITAR de verdade os renderers recebidos em
 * `components` (`h1`/`h2`) em vez de só inspecionar a prop — isso é o que
 * permite verificar o resultado semântico real (quantos `<h1>`/`<h2>` saem
 * no HTML final), sem transformar este arquivo num teste do compilador
 * MDX inteiro: o "corpo" continua sendo dado fixo (duas strings), só os
 * componentes de heading passados pela página são reais.
 */
describe('ArticlePage', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderArticleWith(
    article: PublicArticle | null,
    requestedCategorySlug = 'fones-bluetooth',
  ): Promise<string> {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
      permanentRedirect: jest.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    }));
    jest.doMock('../../../lib/public-api/client', () => ({
      getPublicArticle: jest.fn(() => Promise.resolve(article)),
    }));
    jest.doMock('./compile-article-body', () => ({
      compileArticleBody: jest.fn(() =>
        Promise.resolve(
          ({ components }: { components?: Record<string, ComponentType<{ children?: unknown }> | string> }) => {
            const H1 = components?.h1 ?? 'h1';
            const H2 = components?.h2 ?? 'h2';
            return (
              <div data-testid="mdx-body">
                {/* Simula um `# Título interno` do bodyMdx (remapeado para
                    `h1` no mapa `components`, ver page.tsx) ao lado de um
                    `## Subtítulo` nativo (`h2`) — os dois exercitados de
                    verdade contra o componente real recebido da página. */}
                <H1>Título interno do corpo</H1>
                <H2>Subtítulo do corpo</H2>
              </div>
            );
          },
        ),
      ),
    }));

    const { default: ArticlePage } = await import('./page');
    const html = renderToStaticMarkup(
      await ArticlePage({
        params: Promise.resolve({ categorySlug: requestedCategorySlug, articleSlug: 'melhor-fone' }),
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
      author: null,
    });

    expect(html).toContain('Melhor fone bluetooth 2026');
    expect(html).toContain('links de afiliados');
    // O H1 do bodyMdx (remapeado) e o H2 nativo do corpo renderizam, os
    // dois, como <h2> real no HTML (não como string solta) — resultado
    // semântico, não a implementação interna do mapa `components`.
    expect(html).toContain('Título interno do corpo');
    expect(html).toContain('Subtítulo do corpo');

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

    // Oferta em estoque (Fone A, offerId 333...3) vira link para o
    // endpoint de redirect (WEB-009), com o offerId e o articleId corretos,
    // `target="_blank"` (loja externa abre em nova guia — link interno do
    // FastCompre continua na mesma guia) e
    // `rel="sponsored nofollow noopener noreferrer"` (o `sponsored nofollow`
    // já existia; `noopener noreferrer` é exigido por `target="_blank"` para
    // uma origem externa). `env.SITE_SLUG`/`env.AFFILIATE_REDIRECT_URL` vêm
    // fixados por `jest.setup.ts` ('test-site' / 'http://localhost:3000').
    expect(html).toContain(
      'href="http://localhost:3000/r/test-site/33333333-3333-4333-8333-333333333333' +
        '?articleId=11111111-1111-4111-8111-111111111111"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
    // UXW-009: nome acessível do CTA passa a incluir a indicação de nova
    // aba (texto visualmente oculto, concatenado ao texto visível do link,
    // nunca só um ícone) — critério de aceite explícito desta tarefa.
    expect(html).toContain('<span class="sr-only"> (abre em nova aba)</span>');

    // Ofertas fora de estoque (Fone A, offerId 444...4; Fone B, offerId
    // 666...6) permanecem visíveis, mas nunca viram link.
    expect(html).not.toContain('href="http://localhost:3000/r/test-site/44444444-4444-4444-8444-444444444444');
    expect(html).not.toContain('href="http://localhost:3000/r/test-site/66666666-6666-4666-8666-666666666666');
  });

  it('gera hrefs distintos para múltiplas ofertas em estoque do mesmo produto', async () => {
    const html = await renderArticleWith({
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug: 'fones-bluetooth',
      type: 'COMPARISON',
      title: 'Melhor fone bluetooth 2026',
      slug: 'melhor-fone',
      metaDescription: null,
      coverImageUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      bodyMdx: '# Introdução',
      products: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Fone A',
          description: null,
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
              id: '99999999-9999-4999-8999-999999999999',
              marketplace: 'MERCADO_LIVRE',
              price: '189.90',
              currency: 'BRL',
              inStock: true,
            },
          ],
        },
      ],
      author: null,
    });

    expect(html).toContain(
      'href="http://localhost:3000/r/test-site/33333333-3333-4333-8333-333333333333' +
        '?articleId=11111111-1111-4111-8111-111111111111"',
    );
    expect(html).toContain(
      'href="http://localhost:3000/r/test-site/99999999-9999-4999-8999-999999999999' +
        '?articleId=11111111-1111-4111-8111-111111111111"',
    );
    // Ambos os links de Oferta (loja externa) abrem em nova guia — mesmo
    // critério do teste acima, aqui confirmando que vale para as duas.
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="sponsored nofollow noopener noreferrer"/g)).toHaveLength(2);
    expect(html.match(/\(abre em nova aba\)/g)).toHaveLength(2);
  });

  /**
   * UXW-009, ajuste 2 explícito: verifica o resultado semântico do
   * remapeamento `h1` (bodyMdx) → `<h2>`, não a implementação interna
   * (`components={{ h1: H2 }}`). `products: []` isola o teste do `<h2>`
   * próprio da seção "Produtos" (elemento diferente, sempre presente
   * quando há Produtos — não faz parte deste invariante).
   */
  it('remapeia o H1 do bodyMdx para <h2> com o mesmo estilo visual do H2 nativo, mantendo um único <h1> na página', async () => {
    const html = await renderArticleWith({
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug: 'fones-bluetooth',
      type: 'COMPARISON',
      title: 'Melhor fone bluetooth 2026',
      slug: 'melhor-fone',
      metaDescription: null,
      coverImageUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      bodyMdx: '# Título interno\n\n## Subtítulo',
      products: [],
      author: null,
    });

    // Um único <h1> na página inteira — o título do Artigo, nunca um
    // segundo H1 vindo do corpo (Architecture.md §33).
    const h1Tags = html.match(/<h1[^>]*>/g) ?? [];
    expect(h1Tags).toHaveLength(1);
    expect(html).toContain('<h1 class="font-editorial text-4xl font-semibold text-fg">Melhor fone bluetooth 2026</h1>');

    // O H1 remapeado do bodyMdx ("Título interno do corpo", via mock) e o
    // H2 nativo ("Subtítulo do corpo", via mock) resolvem para <h2> com a
    // MESMA tag de abertura (mesma classe) — prova de que os dois usam o
    // mesmo componente `H2`, não duas implementações que podem divergir.
    const h2Tags = html.match(/<h2[^>]*>/g) ?? [];
    expect(h2Tags).toHaveLength(2);
    expect(h2Tags[0]).toBe(h2Tags[1]);
    expect(html).toContain('Título interno do corpo');
    expect(html).toContain('Subtítulo do corpo');
  });

  it('chama notFound() quando o artigo não existe', async () => {
    await expect(renderArticleWith(null)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('chama permanentRedirect() para a URL canônica quando o categorySlug da URL diverge do real', async () => {
    const article: PublicArticle = {
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug: 'fones-bluetooth',
      type: 'COMPARISON',
      title: 'Melhor fone bluetooth 2026',
      slug: 'melhor-fone',
      metaDescription: 'Comparativo dos melhores fones.',
      coverImageUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      bodyMdx: '# Introdução',
      products: [],
      author: null,
    };

    // Requisição veio com "categoria-errada", mas o Artigo pertence de
    // verdade a "fones-bluetooth".
    await expect(renderArticleWith(article, 'categoria-errada')).rejects.toThrow(
      'NEXT_REDIRECT:/fones-bluetooth/melhor-fone',
    );
  });
});

describe('generateMetadata', () => {
  afterEach(() => {
    jest.resetModules();
  });

  const baseArticle: PublicArticle = {
    id: '11111111-1111-4111-8111-111111111111',
    categorySlug: 'fones-bluetooth',
    type: 'COMPARISON',
    title: 'Melhor fone bluetooth 2026',
    slug: 'melhor-fone',
    metaDescription: 'Comparativo dos melhores fones.',
    coverImageUrl: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    bodyMdx: '# Introdução',
    products: [],
    author: null,
  };

  async function generateMetadataWith(article: PublicArticle | null) {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
    }));
    jest.doMock('../../../lib/public-api/client', () => ({
      getPublicArticle: jest.fn(() => Promise.resolve(article)),
    }));
    // `page.tsx` importa `./compile-article-body` estaticamente, que por sua
    // vez importa `@mdx-js/mdx` (ESM puro) — precisa ficar mockado aqui
    // também, mesmo `generateMetadata` nunca chamando essa função.
    jest.doMock('./compile-article-body', () => ({
      compileArticleBody: jest.fn(),
    }));

    const { generateMetadata } = await import('./page');
    return generateMetadata({
      params: Promise.resolve({ categorySlug: 'fones-bluetooth', articleSlug: 'melhor-fone' }),
    });
  }

  it('retorna title e description quando metaDescription está preenchida', async () => {
    const metadata = await generateMetadataWith(baseArticle);

    expect(metadata.title).toBe('Melhor fone bluetooth 2026 | FastCompre');
    expect(metadata.description).toBe('Comparativo dos melhores fones.');
  });

  it('omite a chave description quando metaDescription é null', async () => {
    const metadata = await generateMetadataWith({ ...baseArticle, metaDescription: null });

    expect(metadata.title).toBe('Melhor fone bluetooth 2026 | FastCompre');
    expect('description' in metadata).toBe(false);
  });

  it('chama notFound() quando o artigo não existe', async () => {
    await expect(generateMetadataWith(null)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
