import type { ComponentType } from 'react';
import { env } from '@/lib/env';
import { resolveProductBlock } from './product-block-resolver';
import type { PublicArticleProduct } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block.tsx
 *
 * UXE-018 — Componente de renderização pública do bloco `:::product`
 * (`ProductBlock`, `PRODUCT_BLOCK_JSX_COMPONENT_NAME` em
 * `product-block-remark-plugin.ts`), resolvido contra
 * `PublicArticle.products[]`.
 *
 * `createProductBlockComponent(products, articleId)` — fábrica que fecha
 * (closure) sobre o array de Produtos públicos e o `id` do Artigo já
 * carregados por `page.tsx`, devolvendo um componente `ProductBlock`
 * pronto para ser passado em `components={{ ProductBlock: ... }}` para
 * `<MDXContent>`. Essa é a estratégia de resolução aprovada no desenho da
 * UXE-018: "component map/closure por Artigo" — nunca React Context
 * global, nunca estado em nível de módulo, nunca um novo `fetch()`. A
 * conexão real com `page.tsx` (chamar esta fábrica e passá-la a
 * `MDXContent`) é fora do escopo desta tarefa — aqui o componente só é
 * exercitado por testes (unitários e de integração MDX real via fixture).
 *
 * Server Component puro — sem `'use client'`: não usa hooks, handlers de
 * evento nem nenhuma API exclusiva de navegador. O `<a>` de CTA é só um
 * link comum (`target="_blank"`), que não exige JS no cliente.
 *
 * Estados (exatamente como fechados no desenho aprovado):
 * - `not-found` (referência sintaticamente válida, mas ausente em
 *   `article.products[]`): estado visual mínimo, sem nenhum dado de outro
 *   Product, sem elemento interativo/focável — não é um erro de página
 *   nem um fallback silencioso (o bloco continua visível como um estado
 *   explícito).
 * - `found` com `offers: []` ou com todas as Ofertas `inStock: false`:
 *   Product permanece renderizado (nome/descrição/imagem), com o aviso
 *   "Temporariamente indisponível" — mesmo critério textual e a mesma
 *   regra (`every((offer) => !offer.inStock)`, vacuamente verdadeira para
 *   array vazio) já usados pela seção estática de Produtos em `page.tsx`,
 *   para não introduzir uma segunda interpretação divergente do
 *   Architecture.md §12.
 * - `found` com pelo menos uma Oferta `inStock: true`: cada Oferta em
 *   estoque vira um CTA real (link de redirect interno); as demais
 *   Ofertas da mesma lista continuam representadas como texto, não como
 *   CTA ativo.
 *
 * Nenhuma Oferta "principal" é inventada por posição/id/preço — todas as
 * Ofertas públicas já presentes em `product.offers` são consideradas, na
 * ordem em que a API pública já as retorna.
 *
 * CTA/tracking (condição de implementação da autorização desta tarefa):
 * reproduz exatamente `GET /r/:siteSlug/:offerId?articleId=...`, a mesma
 * rota/formato já usado por `page.tsx` (`affiliateRedirectHref`) — sem
 * novos parâmetros, sem alteração de encoding/semântica, e sem nunca
 * expor `affiliateUrl` (campo que nem existe em `PublicOffer`). Construído
 * localmente aqui, de propósito, para não antecipar a extração/
 * consolidação desse helper — isso fica para a UXW-011, quando ela já for
 * tocar `page.tsx`.
 *
 * Sem heading fixo, sem `<aside>` assumido — decisão explícita do desenho:
 * o acabamento visual/estrutural (incluindo eventual heading, wrapper
 * semântico e hierarquia editorial) é responsabilidade do ciclo de UI/UX
 * (`UXW-*`), não desta tarefa.
 */

export interface ProductBlockProps {
  productId: string;
}

/**
 * Réplica local e intencional de `affiliateRedirectHref` (`page.tsx`,
 * WEB-009) — mesmo path, mesma origem (`env.AFFILIATE_REDIRECT_URL`, nunca
 * `env.API_URL`), mesmo único query param (`articleId`). Ver nota de
 * escopo acima sobre por que não foi extraída para um helper compartilhado
 * nesta tarefa.
 */
function affiliateHref(offerId: string, articleId: string): string {
  const url = new URL(`/r/${env.SITE_SLUG}/${offerId}`, env.AFFILIATE_REDIRECT_URL);
  url.searchParams.set('articleId', articleId);
  return url.toString();
}

function ProductBlockNotFound() {
  return (
    <div>
      <p>Produto não disponível.</p>
    </div>
  );
}

function ProductBlockFound({
  product,
  articleId,
}: {
  product: PublicArticleProduct;
  articleId: string;
}) {
  const hasOffers = product.offers.length > 0;
  const isUnavailable = product.offers.every((offer) => !offer.inStock);

  return (
    <div>
      <p>
        <strong>{product.name}</strong>
      </p>
      {product.description && <p>{product.description}</p>}
      {product.imageUrl && (
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
      )}
      {isUnavailable && <p>Temporariamente indisponível</p>}
      {hasOffers && (
        <ul>
          {product.offers.map((offer) => (
            <li key={offer.id}>
              {offer.inStock ? (
                <a
                  href={affiliateHref(offer.id, articleId)}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                >
                  {offer.marketplace} — {offer.price} {offer.currency}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : (
                <span>
                  {offer.marketplace} — {offer.price} {offer.currency} (indisponível)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function createProductBlockComponent(
  products: PublicArticleProduct[],
  articleId: string,
): ComponentType<ProductBlockProps> {
  return function ProductBlock({ productId }: ProductBlockProps) {
    const resolution = resolveProductBlock(products, productId);

    if (resolution.status === 'not-found') {
      return <ProductBlockNotFound />;
    }

    return <ProductBlockFound product={resolution.product} articleId={articleId} />;
  };
}
