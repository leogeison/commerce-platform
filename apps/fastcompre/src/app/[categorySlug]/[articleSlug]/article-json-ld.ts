import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { PublicArticle } from '@commerce-platform/contracts';
import { env } from '@/lib/env';
import { affiliateRedirectHref } from './affiliate-redirect-href';

/**
 * JSON-LD estrutural de `Article`/`Product` (UXW-005A) — corrige a dívida
 * identificada na investigação da UXW-006: `Architecture.md` §29/§33
 * descrevem dados estruturados (JSON-LD) derivados na renderização pública
 * como decisão já aprovada, mas nenhuma implementação existia até esta
 * tarefa. Decisão do Product Owner: é requisito normativo já devido, não
 * antecipação de UXW-007+.
 *
 * Escopo: só a página de Artigo (`page.tsx`). Home e Categoria ficam sem
 * JSON-LD — decisão fechada, fora desta tarefa.
 *
 * Tudo aqui é derivado inteiramente de `PublicArticle` (e dos contratos que
 * ela agrega — `PublicArticleAuthor`, `PublicArticleProduct`,
 * `PublicOffer`), nunca persistido em Prisma/`Article` — mesma garantia que
 * `Architecture.md` já exige para dados estruturados. Nenhuma propriedade é
 * inventada sem dado real correspondente:
 * - `Article.dateModified`: OMITIDO — `updatedAt` não é exposto pelo
 *   contrato público (`PublicArticleSummary`), nenhuma mudança de contrato
 *   nesta tarefa;
 * - `Article.publisher.logo`: OMITIDO — não existe nenhum asset de logo no
 *   projeto;
 * - `Offer.seller`: OMITIDO — os enums atuais de `marketplace`
 *   (`MERCADO_LIVRE`/`AMAZON_BR`/`AMAZON_INTL`/`ALIEXPRESS`) são
 *   provisórios, a revisar antes de produção; nenhum mapeamento de nome
 *   comercial nem refatoração do enum nesta tarefa.
 *
 * `@graph` com um nó `Article` e um nó `Product` por item real de
 * `article.products[]` (nunca zero, nunca inventado) — `Article.mentions`
 * referencia cada Produto por `{'@id': ...}`, sem duplicar o objeto
 * completo dentro do Artigo. Cada nó carrega um `@id` estável derivado da
 * URL canônica do Artigo (`/:categorySlug/:slug`, mesmo padrão de
 * `sitemap.ts`) — nunca do mecanismo de redirect de afiliado, que é uma
 * URL diferente (`Offer.url`).
 *
 * Produto sem Ofertas omite a propriedade `offers` inteira (nunca
 * `offers: []`) — o mesmo critério que `page.tsx` já usa para decidir
 * `hasOffers` no HTML visível. `Offer.url` reutiliza
 * `affiliateRedirectHref()` (extraída para `affiliate-redirect-href.ts`
 * nesta mesma tarefa) — a MESMA função e o MESMO resultado do link visível
 * de afiliado, nunca uma segunda lógica de montagem de URL. Nenhum
 * mecanismo novo de tolerância/fallback para dado fora do shape já
 * validado pelos contratos públicos: se `article`/`product`/`offer` têm o
 * shape do contrato, a derivação é direta.
 */
export function buildArticleJsonLd(article: PublicArticle): Record<string, unknown> {
  const articleUrl = new URL(`/${article.categorySlug}/${article.slug}`, env.SITE_URL).toString();
  const productNodeId = (productId: string) => `${articleUrl}#product-${productId}`;

  const productNodes = article.products.map((product) => ({
    '@type': 'Product',
    '@id': productNodeId(product.id),
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    ...(product.offers.length > 0
      ? {
          offers: product.offers.map((offer) => ({
            '@type': 'Offer',
            url: affiliateRedirectHref(offer.id, article.id),
            price: offer.price,
            priceCurrency: offer.currency,
            availability: offer.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          })),
        }
      : {}),
  }));

  const articleNode: Record<string, unknown> = {
    '@type': 'Article',
    '@id': `${articleUrl}#article`,
    headline: article.title,
    url: articleUrl,
    mainEntityOfPage: articleUrl,
    datePublished: article.publishedAt,
    publisher: {
      '@type': 'Organization',
      name: 'FastCompre',
      url: env.SITE_URL,
    },
    ...(article.metaDescription ? { description: article.metaDescription } : {}),
    ...(article.coverImageUrl ? { image: article.coverImageUrl } : {}),
    ...(article.author
      ? {
          author: {
            '@type': 'Person',
            name: article.author.name,
            ...(article.author.avatarUrl ? { image: article.author.avatarUrl } : {}),
          },
        }
      : {}),
    ...(article.products.length > 0
      ? { mentions: article.products.map((product) => ({ '@id': productNodeId(product.id) })) }
      : {}),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [articleNode, ...productNodes],
  };
}

/**
 * Serialização segura para injeção dentro de `<script>`: o navegador faz o
 * parsing do conteúdo de `<script>` em "modo texto bruto" — o escape padrão
 * de filhos JSX (`<` → `&lt;`) NÃO é decodificado de volta por esse parser,
 * então corromperia o JSON. A mitigação padrão é escapar `<` para o escape
 * Unicode `<` ANTES da injeção: o navegador nunca vê um `<` literal que
 * poderia fechar a tag prematuramente (ex.: `</script>` embutido no nome ou
 * na descrição de um Produto), e `JSON.parse()` do lado consumidor decodifica
 * `<` de volta para `<` normalmente — round-trip seguro e sem perda.
 */
function serializeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

export function ArticleJsonLd({ article }: { article: PublicArticle }): ReactElement {
  const json = serializeJsonLd(buildArticleJsonLd(article));

  // `createElement` em vez de JSX: este módulo é `.ts` (não `.tsx`), por
  // decisão explícita do desenho aprovado desta tarefa.
  return createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: json },
  });
}
