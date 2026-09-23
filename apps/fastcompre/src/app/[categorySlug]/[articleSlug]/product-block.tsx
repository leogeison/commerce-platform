import type { ComponentType } from 'react';
import { resolveProductBlock } from './product-block-resolver';
import { ProductOfferList } from './product-offer-list';
import type { PublicArticleProduct } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block.tsx
 *
 * UXE-018 — Componente de renderização pública do bloco `:::product`
 * (`ProductBlock`, `PRODUCT_BLOCK_JSX_COMPONENT_NAME` em
 * `product-block-remark-plugin.ts`), resolvido contra
 * `PublicArticle.products[]`. Acabamento visual/estrutural e consolidação
 * de tracking implementados na UXW-011 (ver notas específicas abaixo).
 *
 * `createProductBlockComponent(products, articleId)` — fábrica que fecha
 * (closure) sobre o array de Produtos públicos e o `id` do Artigo já
 * carregados por `page.tsx`, devolvendo um componente `ProductBlock`
 * pronto para ser passado em `components={{ ProductBlock: ... }}` para
 * `<MDXContent>`. Estratégia de resolução aprovada no desenho da UXE-018:
 * "component map/closure por Artigo" — nunca React Context global, nunca
 * estado em nível de módulo, nunca um novo `fetch()`. Conectado a
 * `page.tsx` pela UXW-011.
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
 * UXW-011 — tracking consolidado: a lista de Ofertas (CTA/`rel`/
 * `target`/`sr-only`) passou a ser `<ProductOfferList>`
 * (`product-offer-list.tsx`), a mesma usada pela seção estática de
 * Produtos em `page.tsx` — nenhuma réplica local de
 * `affiliateRedirectHref` permanece aqui. `GET
 * /r/:siteSlug/:offerId?articleId=...` continua exatamente igual; sem
 * novos parâmetros, sem alteração de encoding/semântica, sem nunca expor
 * `affiliateUrl` (campo que nem existe em `PublicOffer`).
 *
 * UXW-011 — acabamento visual/estrutural ("Editorial Confiável"): `<div>`
 * nativo simples, sem `role`/`aria-label` — o conteúdo (nome visível,
 * descrição/status em texto, `<ul>/<li>` semântico de Ofertas, `<a>`
 * naturalmente focável) já é semanticamente correto por si só, sem exigir
 * papel ARIA extra. Deliberadamente sem heading (`h1`–`h6`), sem
 * `<section>`/`<aside>`/landmark: a posição do bloco no outline editorial
 * varia (pode vir logo após um `h2`, um `h5`, ou nenhum subtítulo ainda) —
 * um heading fixo aqui criaria saltos de nível não-monotônicos no
 * documento. `font-ui` explícito no wrapper: o bloco renderiza dentro do
 * `<div class="font-editorial">` do corpo MDX (`page.tsx`), e precisa
 * reverter essa herança — mesma regra já congelada na UXW-009 ("Data/
 * byline/CTA/seção comercial permanecem em Geist Sans"), já que este é um
 * cartão comercial, não conteúdo editorial em si. `rounded-control
 * border border-outline bg-surface` reaproveita o mesmo trio de tokens já
 * usado como "cartão" em `apps/admin/.../dashboard.tsx` — nenhum token
 * novo, e deliberadamente sem `shadow` (usado no projeto só em overlays/
 * dropdowns) para não ler como elemento flutuante/anúncio. Imagem com
 * `width`/`height` explícitos (mesmas dimensões já usadas na seção
 * estática) e `loading="lazy"` — estabilidade de dimensão para não causar
 * CLS, sem antecipar `next/image` (UXW-013). `min-w-0` no bloco de texto
 * — mesmo padrão já usado na byline (UXW-010) — garante reflow em vez de
 * overflow a 320px/zoom 200%, com a imagem de largura fixa ao lado.
 */

export interface ProductBlockProps {
  productId: string;
}

function ProductBlockNotFound() {
  return (
    <div className="mt-8 rounded-control border border-outline bg-surface p-4 font-ui">
      <p className="text-body-sm text-fg-muted">Produto não disponível.</p>
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
    <div className="mt-8 rounded-control border border-outline bg-surface p-4 font-ui sm:p-6">
      <div className="flex gap-4">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            width={96}
            height={96}
            loading="lazy"
            className="aspect-square w-24 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="font-medium text-fg">{product.name}</p>
          {product.description && (
            <p className="mt-1 text-body-sm text-fg-muted">{product.description}</p>
          )}
          {isUnavailable && (
            <p className="mt-1 text-body-sm text-fg-muted">Temporariamente indisponível</p>
          )}
          {hasOffers && <ProductOfferList offers={product.offers} articleId={articleId} />}
        </div>
      </div>
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
