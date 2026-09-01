/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/node.ts
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * `ProductBlockNode` — porte para TypeScript de
 * `spikes/lexical-editorial/product-block-transformer.mjs` (UXE-003/UXE-004),
 * ACRESCENTANDO `createDOM`/`updateDOM` (ausentes de propósito no spike —
 * ver comentário original: "Qualquer integração futura que precise
 * renderizar este node visualmente dentro de um editor real (UXE-006+)
 * implementa createDOM/updateDOM nesse momento, não antes"). É exatamente
 * o que esta tarefa faz — nada além disso.
 *
 * Escopo explicitamente aprovado para esta tarefa (não confundir com
 * UXE-011, "Bloco Produto/Oferta: UI de inserção/edição"):
 *   - o node existe, é importável/exportável (Markdown) e reconcilia no
 *     editor real (DOM real, não headless);
 *   - representação DOM MÍNIMA — um bloco não editável, sem nome, preço,
 *     link, disponibilidade ou qualquer outro dado de Produto/Oferta;
 *   - SEM seletor de Produto, SEM inserção/edição funcional, SEM
 *     resolução contra `ArticleProduct`/`Product`/`Offer` — isso é
 *     `UXE-011`.
 *
 * Único estado editorial de domínio: `productId` (Editorial Serialization
 * Contract §4 — GARANTIA NORMATIVA). Nenhuma implementação futura pode
 * adicionar a este node nome, preço, link de afiliado, `inStock`,
 * `offerId` ou qualquer outro snapshot — tudo mais é resolvido
 * dinamicamente em UXE-011/UXE-018.
 */

import { $applyNodeReplacement, createState, $getState, $setState, ElementNode } from 'lexical';
import { ProductBlockSyntaxError, parseProductBlockBody, serializeProductBlock } from './grammar';

export const PRODUCT_BLOCK_NODE_TYPE = 'product-block';

const productIdState = createState('productId', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

// Classe CSS/atributo usados só para identificação no DOM e nos testes —
// nenhum dado de domínio é exposto aqui além do `productId` (necessário
// só para que o bloco seja identificável; não é lido/resolvido por nada
// nesta tarefa).
const DOM_CLASS_NAME = 'product-block-node';

export class ProductBlockNode extends ElementNode {
  static getType(): string {
    return PRODUCT_BLOCK_NODE_TYPE;
  }

  static clone(node: ProductBlockNode): ProductBlockNode {
    return new ProductBlockNode(node.__key);
  }

  /**
   * Representação DOM mínima (nova nesta tarefa — o spike não implementava
   * isto, por decisão fechada, já que rodava em modo headless). Bloco
   * marcado como não editável (`contentEditable = 'false'`) — o usuário
   * pode selecioná-lo/removê-lo como unidade atômica via teclado (Lexical
   * trata `ElementNode` sem filhos de texto como uma unidade de
   * navegação), mas não digitar dentro dele. Nenhuma UI de edição/seleção
   * de Produto — isso é `UXE-011`.
   */
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = DOM_CLASS_NAME;
    dom.contentEditable = 'false';
    dom.setAttribute('data-lexical-product-block', 'true');
    dom.setAttribute('data-product-id', this.getProductId());
    dom.textContent = 'Bloco de Produto vinculado';
    return dom;
  }

  /**
   * `productId` não tem representação visual nesta tarefa (sem nome/preço
   * resolvido) — só o atributo `data-product-id` precisa acompanhar uma
   * eventual troca de `productId`. Como a gramática v1 não permite editar
   * um bloco existente (só remover/recriar), isto na prática nunca muda
   * depois da criação — mantido por completude/corretude do contrato de
   * `updateDOM`, não por um caminho exercitado hoje.
   */
  updateDOM(_prevNode: ProductBlockNode, dom: HTMLElement): boolean {
    dom.setAttribute('data-product-id', this.getProductId());
    return false;
  }

  getProductId(): string {
    return $getState(this, productIdState);
  }

  setProductId(productId: string): this {
    $setState(this, productIdState, productId);
    return this;
  }
}

export function $createProductBlockNode(productId: string): ProductBlockNode {
  const node = new ProductBlockNode();
  node.setProductId(productId);
  return $applyNodeReplacement(node);
}

export function $isProductBlockNode(node: unknown): node is ProductBlockNode {
  return node instanceof ProductBlockNode;
}

export { ProductBlockSyntaxError, parseProductBlockBody, serializeProductBlock };
