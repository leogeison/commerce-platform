/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-block-utils.ts
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * `$getBlockElement` — resolve o elemento de bloco de nível superior
 * (parágrafo/heading/citação/lista) a partir de um nó qualquer, usado por
 * `article-body-toolbar.tsx` e `article-body-slash-menu.tsx`.
 *
 * Correção de tipo (typecheck/build falhavam antes desta extração):
 * `selection.anchor.getNode()` retorna `TextNode | ElementNode`. A forma
 * anterior (`node.getKey() === 'root' ? node : node.getTopLevelElementOrThrow()`)
 * comparava uma string (`getKey()`), o que não estreita o tipo de `node`
 * para o TypeScript — os dois ramos do ternário permaneciam
 * `TextNode | ElementNode`, e chamar `.clear()`/`.replace()` (métodos só
 * de `ElementNode`) sobre esse union falhava o typecheck. A correção usa
 * `$isElementNode`, um type guard real: quando `node` já é um elemento
 * (ex.: parágrafo vazio, seleção ancorada nele mesmo — não há nada mais
 * interno para descer), ele já É o bloco procurado; quando é um
 * `TextNode`, sobe via `getTopLevelElementOrThrow()`.
 *
 * Segunda correção de tipo (rodada seguinte): `getTopLevelElementOrThrow()`
 * é tipado pelo próprio Lexical como `ElementNode | DecoratorNode<unknown>`
 * (um bloco de nível superior pode ser um `DecoratorNode`), então o ramo
 * `else` do ternário acima não retornava só `ElementNode` como o comentário
 * original presumia — `$isRootNode` sozinho não elimina `DecoratorNode` do
 * union. A função agora também aplica `$isElementNode` ao resultado final
 * (ver corpo abaixo) antes de retornar, o que descarta `DecoratorNode`
 * (tratado como "nenhum bloco de texto aplicável", igual ao root) sem
 * nenhum cast.
 *
 * Retorna `null` só no caso defensivo (não esperado em uso normal — o
 * Lexical normaliza um documento vazio para sempre conter um parágrafo)
 * de a seleção resolver para a própria raiz do documento — chamadores
 * devem tratar isso como "nenhuma ação", nunca operar sobre o root
 * inteiro.
 */

import { $isElementNode, $isRootNode, type ElementNode, type LexicalNode } from 'lexical';

export function $getBlockElement(node: LexicalNode): ElementNode | null {
  const element = $isElementNode(node) ? node : node.getTopLevelElementOrThrow();
  // `getTopLevelElementOrThrow()` retorna `ElementNode | DecoratorNode<unknown>`
  // (um bloco de nível superior pode ser um `DecoratorNode`, ex.: um futuro
  // bloco Produto-Oferta) — `$isRootNode` sozinho não estreita essa parte
  // do union para o TypeScript. `$isElementNode` é o type guard real que
  // exclui `DecoratorNode`; combinado com `$isRootNode`, o retorno depois
  // deste `if` já é comprovadamente `ElementNode`, sem cast.
  if (!$isElementNode(element) || $isRootNode(element)) {
    return null;
  }
  return element;
}
