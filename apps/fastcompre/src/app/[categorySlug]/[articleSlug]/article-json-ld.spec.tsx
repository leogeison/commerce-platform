import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicArticle } from '@commerce-platform/contracts';
import { env } from '@/lib/env';
import { buildArticleJsonLd, ArticleJsonLd } from './article-json-ld';
import { affiliateRedirectHref } from './affiliate-redirect-href';

/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/article-json-ld.spec.tsx
 *
 * UXW-005A — cobre os critérios de aceite/testes mínimos do desenho
 * aprovado: derivação `Article`/`Product` (campos opcionais
 * presentes/ausentes, 0/N Products, 0/N Offers e omissão de `offers`
 * quando vazio, `InStock`/`OutOfStock`, correspondência exata
 * `mentions[].@id` ↔ `Product.@id`), round-trip seguro de serialização, e
 * integração com a página real de Artigo confirmando o
 * `<script type="application/ld+json">` e `Offer.url` byte-idêntico ao
 * link visível.
 *
 * Extensão `.spec.tsx` (não `.spec.ts`): o conteúdo exige JSX tanto para
 * montar `<ArticleJsonLd article={...} />` quanto para o componente MDX
 * mockado usado no bloco de integração com a página real (mesmo padrão de
 * `page.spec.tsx`, reproduzido aqui sem alterá-lo).
 */

const FULL_ARTICLE: PublicArticle = {
  id: '11111111-1111-4111-8111-111111111111',
  categorySlug: 'fones-bluetooth',
  type: 'COMPARISON',
  title: 'Melhor fone bluetooth 2026',
  slug: 'melhor-fone',
  metaDescription: 'Comparativo dos melhores fones.',
  coverImageUrl: 'https://cdn.example.com/capa.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
  bodyMdx: '# Introdução',
  products: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Fone A',
      description: 'Descrição do fone A.',
      imageUrl: 'https://cdn.example.com/fone-a.jpg',
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
      offers: [],
    },
  ],
  author: { name: 'Ana Redatora', avatarUrl: 'https://cdn.example.com/ana.jpg' },
};

// `env.SITE_URL` vem fixado por `jest.setup.ts` ('http://localhost:3001') —
// mesma origem usada por `sitemap.spec.ts` para o mesmo padrão de URL
// absoluta.
const ARTICLE_URL = 'http://localhost:3001/fones-bluetooth/melhor-fone';

describe('buildArticleJsonLd', () => {
  it('deriva o nó Article com todos os campos opcionais presentes', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@context': string; '@graph': Array<Record<string, unknown>> };

    expect(jsonLd['@context']).toBe('https://schema.org');
    const articleNode = jsonLd['@graph'][0];
    expect(articleNode).toMatchObject({
      '@type': 'Article',
      '@id': `${ARTICLE_URL}#article`,
      headline: 'Melhor fone bluetooth 2026',
      url: ARTICLE_URL,
      datePublished: '2026-01-01T00:00:00.000Z',
      description: 'Comparativo dos melhores fones.',
      image: 'https://cdn.example.com/capa.jpg',
      author: { '@type': 'Person', name: 'Ana Redatora', image: 'https://cdn.example.com/ana.jpg' },
    });
  });

  it('inclui publisher (Organization) e mainEntityOfPage no nó Article, sem publisher.logo', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@graph': Array<Record<string, unknown>> };
    const articleNode = jsonLd['@graph'][0] as { publisher: Record<string, unknown>; mainEntityOfPage: unknown };

    expect(articleNode.publisher['@type']).toBe('Organization');
    expect(articleNode.publisher.name).toBe('FastCompre');
    expect(articleNode.publisher.url).toBe(env.SITE_URL);
    expect('logo' in articleNode.publisher).toBe(false);
    expect(articleNode.mainEntityOfPage).toBe(ARTICLE_URL);
  });

  it('omite description/image/author/author.image quando os campos opcionais estão ausentes', () => {
    const article: PublicArticle = {
      ...FULL_ARTICLE,
      metaDescription: null,
      coverImageUrl: null,
      author: { name: 'Ana Redatora', avatarUrl: null },
    };
    const jsonLd = buildArticleJsonLd(article) as { '@graph': Array<Record<string, unknown>> };
    const articleNode = jsonLd['@graph'][0];

    expect('description' in articleNode).toBe(false);
    expect('image' in articleNode).toBe(false);
    expect(articleNode.author).toEqual({ '@type': 'Person', name: 'Ana Redatora' });

    const articleNoAuthor = buildArticleJsonLd({ ...article, author: null }) as {
      '@graph': Array<Record<string, unknown>>;
    };
    expect('author' in articleNoAuthor['@graph'][0]).toBe(false);
  });

  it('deriva um nó Product por item de products[], omitindo offers quando vazio (0/N Products e Offers)', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@graph': Array<Record<string, unknown>> };
    const [, foneA, foneB] = jsonLd['@graph'];

    expect(foneA).toMatchObject({
      '@type': 'Product',
      '@id': `${ARTICLE_URL}#product-22222222-2222-4222-8222-222222222222`,
      name: 'Fone A',
      description: 'Descrição do fone A.',
      image: 'https://cdn.example.com/fone-a.jpg',
    });
    expect(Array.isArray(foneA.offers)).toBe(true);
    expect((foneA.offers as unknown[]).length).toBe(2);

    // Fone B não tem Ofertas — `offers` precisa estar ausente, nunca `[]`.
    expect(foneB).toMatchObject({
      '@type': 'Product',
      '@id': `${ARTICLE_URL}#product-55555555-5555-4555-8555-555555555555`,
      name: 'Fone B',
    });
    expect('offers' in foneB).toBe(false);
    expect('description' in foneB).toBe(false);
    expect('image' in foneB).toBe(false);
  });

  it('0 Products → @graph só com o nó Article, sem mentions', () => {
    const article: PublicArticle = { ...FULL_ARTICLE, products: [] };
    const jsonLd = buildArticleJsonLd(article) as { '@graph': Array<Record<string, unknown>> };

    expect(jsonLd['@graph']).toHaveLength(1);
    expect('mentions' in jsonLd['@graph'][0]).toBe(false);
  });

  it('mapeia availability InStock/OutOfStock a partir de Offer.inStock', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@graph': Array<Record<string, unknown>> };
    const foneA = jsonLd['@graph'][1] as { offers: Array<Record<string, unknown>> };

    expect(foneA.offers[0].availability).toBe('https://schema.org/InStock');
    expect(foneA.offers[1].availability).toBe('https://schema.org/OutOfStock');
  });

  it('Offer.url é produzido pela MESMA affiliateRedirectHref usada no link visível — sem lógica de URL duplicada', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@graph': Array<Record<string, unknown>> };
    const foneA = jsonLd['@graph'][1] as { offers: Array<Record<string, unknown>> };

    expect(foneA.offers[0].url).toBe(
      affiliateRedirectHref('33333333-3333-4333-8333-333333333333', FULL_ARTICLE.id),
    );
    expect(foneA.offers[1].url).toBe(
      affiliateRedirectHref('44444444-4444-4444-8444-444444444444', FULL_ARTICLE.id),
    );
  });

  it('Article.mentions[].@id corresponde exatamente ao Product.@id de cada produto, na mesma ordem', () => {
    const jsonLd = buildArticleJsonLd(FULL_ARTICLE) as { '@graph': Array<Record<string, unknown>> };
    const articleNode = jsonLd['@graph'][0] as { mentions: Array<{ '@id': string }> };
    const productIds = jsonLd['@graph'].slice(1).map((node) => node['@id']);

    expect(articleNode.mentions.map((mention) => mention['@id'])).toEqual(productIds);
  });
});

describe('ArticleJsonLd — serialização segura', () => {
  it('escapa "<" antes da injeção e sobrevive a um round-trip de JSON.parse, mesmo com </script> e <...> em campo real', () => {
    const article: PublicArticle = {
      ...FULL_ARTICLE,
      title: 'Guia </script><img src=x onerror="alert(1)"> definitivo',
      products: [{ ...FULL_ARTICLE.products[0], description: 'Cabo </script> USB-C <b>reforçado</b>' }],
    };

    const html = renderToStaticMarkup(ArticleJsonLd({ article }));

    // A única ocorrência real de "</script>" no HTML é o fechamento da
    // própria tag — o conteúdo perigoso embutido no título/descrição não
    // pode ter produzido uma segunda sequência de fechamento.
    expect(html.match(/<\/script>/g)).toHaveLength(1);

    const match = html.match(/<script type="application\/ld\+json">([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    const scriptContent = match![1];

    // O "<" real nunca aparece cru dentro do script — só a forma escapada.
    expect(scriptContent).not.toContain('<');
    expect(scriptContent).toContain('\\u003c');

    const parsed = JSON.parse(scriptContent) as { '@graph': Array<Record<string, unknown>> };
    expect(parsed['@graph'][0].headline).toBe('Guia </script><img src=x onerror="alert(1)"> definitivo');
    expect(parsed['@graph'][1].description).toBe('Cabo </script> USB-C <b>reforçado</b>');
  });
});

describe('Integração com a página real de Artigo (ArticlePage)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderArticlePage(article: PublicArticle): Promise<string> {
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
    // UXW-011 — `compileArticleBody` passa a devolver `{ MDXContent,
    // referencedProductIds }` (não mais um componente solto, ver
    // `compile-article-body.ts`/`page.spec.tsx`); `page.tsx` usa
    // `referencedProductIds.has(...)` para filtrar a seção estática de
    // Produtos, então o mock precisa incluir um Set (vazio: nenhum bloco
    // `:::product` no corpo simulado aqui, comportamento irrelevante para
    // este arquivo, que testa só o JSON-LD).
    jest.doMock('./compile-article-body', () => ({
      compileArticleBody: jest.fn(() =>
        Promise.resolve({
          MDXContent: ({ components }: { components?: { h1?: string } }) => (
            <div data-testid="mdx-body">corpo-compilado h1={components?.h1}</div>
          ),
          referencedProductIds: new Set<string>(),
        }),
      ),
    }));

    const { default: ArticlePage } = await import('./page');
    return renderToStaticMarkup(
      await ArticlePage({
        params: Promise.resolve({ categorySlug: article.categorySlug, articleSlug: article.slug }),
      }),
    );
  }

  it('renderiza <script type="application/ld+json"> na página real, com Offer.url byte-idêntico ao href visível', async () => {
    const html = await renderArticlePage(FULL_ARTICLE);

    expect(html).toContain('<script type="application/ld+json">');

    const match = html.match(/<script type="application\/ld\+json">([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    const jsonLd = JSON.parse(match![1]) as { '@graph': Array<Record<string, unknown>> };
    const foneA = jsonLd['@graph'][1] as { offers: Array<{ url: string }> };

    // Mesmo href já validado por `page.spec.tsx` para o link visível deste
    // exato offerId/articleId (não redigitado aqui — recomputado pela
    // mesma função compartilhada, byte a byte).
    const expectedHref = affiliateRedirectHref(
      '33333333-3333-4333-8333-333333333333',
      FULL_ARTICLE.id,
    );
    expect(foneA.offers[0].url).toBe(expectedHref);
    expect(html).toContain(`href="${expectedHref}"`);
  });
});
