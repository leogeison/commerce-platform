/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-card-layout.ts
 *
 * UXP-001 — Corrigir card público de Produto/Ofertas em mobile.
 *
 * Classes de layout compartilhadas pelos dois consumidores reais do card de
 * Produto nesta página: o bloco inline `:::product` (`product-block.tsx`,
 * `ProductBlockFound`) e a seção estática "Produtos" (`page.tsx`). Os dois
 * tinham o mesmo defeito (imagem esticada pelo `align-items: stretch`
 * padrão de um `flex` sem altura própria, e todo o conteúdo espremido numa
 * coluna estreita ao lado de uma imagem fixa de 96px no mobile) — uma única
 * fonte das classes evita que os dois voltem a divergir. Local a
 * `apps/fastcompre` (conhece "Produto"; nunca `packages/ui`).
 *
 * Composição (ordem no DOM sempre: imagem, nome, detalhes):
 * - mobile (`< sm`, aprovado e congelado): coluna única — imagem 96×96
 *   centralizada horizontalmente (`justify-self-center`), depois nome,
 *   descrição/status e Ofertas em largura total do card, textos à esquerda.
 *   Os refinamentos de desktop só acrescentam classes com prefixo `sm:`.
 * - `sm`+: composição lateral em toda a largura interna do card — coluna da
 *   imagem de 11rem (176px) com a imagem 176×176 centralizada nela, na
 *   horizontal e na vertical (`self-center`, ocupando as duas linhas via
 *   `row-span-2`); à direita, nome (negrito, à esquerda) e detalhes, com
 *   uma linha divisória vertical (`border-l`) entre imagem e conteúdo.
 *   176px é o maior tamanho que ainda deixa a coluna de conteúdo larga o
 *   bastante para 2 Ofertas lado a lado sem quebrar o texto do CTA no card
 *   de largura máxima do Artigo. `grid-rows-[auto_1fr]` faz a linha de
 *   detalhes absorver qualquer sobra de altura, mantendo a linha divisória
 *   contínua do nome até o fim do conteúdo.
 * - sem imagem: coluna única em qualquer largura, sem linha divisória.
 *
 * `object-contain` mostra o Produto inteiro em vez de recortá-lo (decisão do
 * PO). `next/image`: `width`/`height` intrínsecos de 176 (o maior tamanho
 * exibido) + `sizes` responsivo — o navegador escolhe a variante pela
 * largura realmente exibida (96px no mobile, a mesma variante de antes;
 * 176px em `sm`+), nunca ampliando uma variante menor no desktop.
 */
export const PRODUCT_CARD_IMAGE_SIZE_PX = 176;
export const PRODUCT_CARD_IMAGE_SIZES = '(min-width: 640px) 176px, 96px';

const PRODUCT_CARD_GRID_BASE = 'grid grid-cols-1 gap-y-1';

export function productCardGridClassName(hasImage: boolean): string {
  return hasImage
    ? `${PRODUCT_CARD_GRID_BASE} sm:grid-cols-[11rem_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:gap-x-6 sm:gap-y-0`
    : PRODUCT_CARD_GRID_BASE;
}

export const PRODUCT_CARD_IMAGE_CLASS_NAME =
  'mb-2 h-24 w-24 self-start justify-self-center rounded object-contain sm:row-span-2 sm:mb-0 sm:h-44 sm:w-44 sm:self-center';

/**
 * Linha divisória entre a coluna da imagem e o conteúdo, só em `sm`+ e só
 * quando há imagem. Aplicada ao nome e ao bloco de detalhes — os dois
 * itens da coluna de conteúdo, sem espaço vertical entre eles em `sm`+ —
 * formando uma única linha contínua, sem `<div>` extra no DOM.
 */
function contentDividerClassName(hasImage: boolean): string {
  return hasImage ? 'sm:border-l sm:border-outline-subtle sm:pl-6' : '';
}

/**
 * Junta classes sempre separadas por espaço. Importante: o scanner do
 * Tailwind só gera uma classe que aparece como token isolado no código-fonte
 * — uma classe colada a uma interpolação (ex.: `sm:font-semibold${...}`) não
 * é reconhecida e simplesmente não existe no CSS gerado.
 */
function joinClassNames(...classNames: string[]): string {
  return classNames.filter(Boolean).join(' ');
}

/** Nome do Produto: à esquerda, em negrito a partir de `sm` (mobile inalterado). */
export function productCardNameClassName(baseClassName: string, hasImage: boolean): string {
  return joinClassNames(baseClassName, 'sm:font-semibold', contentDividerClassName(hasImage));
}

export function productCardDetailsClassName(hasImage: boolean): string {
  return joinClassNames('min-w-0', contentDividerClassName(hasImage));
}
