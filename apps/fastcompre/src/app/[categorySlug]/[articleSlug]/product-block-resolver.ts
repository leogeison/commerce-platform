import type { PublicArticleProduct } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-resolver.ts
 *
 * UXE-018 — Resolução de `productId` (extraído do bloco `:::product` pelo
 * `remarkProductBlock`, UXE-017) contra `PublicArticle.products[]`.
 *
 * Estratégia normativa (desenho técnico aprovado da UXE-018): `productId →
 * lookup exclusivamente em article.products[] → found | not-found`. Nunca
 * um lookup global de Produto, nunca um novo `fetch()`/endpoint, nunca
 * Context React ou estado module-level — `products` é sempre recebido por
 * parâmetro, escopado ao Artigo que está sendo renderizado no momento
 * (mesma fonte estrutural que a seção estática de Produtos já usa em
 * `page.tsx`).
 *
 * Função pura e síncrona, sem I/O — não tem conhecimento de HTTP,
 * `fetch`, cache ou de qual Artigo está sendo renderizado além do array já
 * resolvido que recebe.
 */

export type ProductBlockResolution =
  | { status: 'found'; product: PublicArticleProduct }
  | { status: 'not-found' };

/**
 * `productId` sintaticamente válido (já validado como UUID pela gramática
 * em `@commerce-platform/editorial` antes de chegar aqui) mas ausente em
 * `products` é um resultado normal desta função — `not-found` — não uma
 * exceção. Esta é exatamente a distinção fechada no desenho da UXE-018:
 * sintaxe malformada continua fail-closed (`ProductBlockSyntaxError`,
 * lançado por `remarkProductBlock`/`parseProductBlockBody`, antes mesmo de
 * este resolver ser chamado); sintaxe válida com referência ausente é um
 * estado visual, tratado por quem consome esta resolução
 * (`product-block.tsx`), nunca um erro de página.
 */
export function resolveProductBlock(
  products: PublicArticleProduct[],
  productId: string,
): ProductBlockResolution {
  const product = products.find((candidate) => candidate.id === productId);
  return product ? { status: 'found', product } : { status: 'not-found' };
}
