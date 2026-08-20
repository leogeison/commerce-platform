/**
 * spikes/lexical-editorial/product-block-transformer.mjs
 *
 * UXE-003 — Sintaxe customizada versionável + transformers Lexical para o
 * bloco editorial de Produto.
 *
 * Gramática v1 (aprovada, canônica):
 *
 *   :::product
 *   version: 1
 *   productId: <uuid>
 *   :::
 *
 * A partir da UXE-004, a validação pura da gramática (regexes, contagem de
 * linhas, checagem de version/UUID e serialização) vive em
 * `product-block-grammar.mjs`, para ser reutilizada sem duplicação pelo
 * novo remark plugin (`product-block-remark-plugin.mjs`). Esta extração foi
 * mecânica — nenhuma regra de validação, mensagem de erro ou ordem de
 * checagem mudou. Este arquivo continua sendo a única autoridade sobre:
 *   - a forma do node Lexical (`ProductBlockNode`) e seu payload;
 *   - a integração com a API de `MultilineElementTransformer` do
 *     `@lexical/markdown` (`regExpStart`/`regExpEnd`/`replace`), incluindo a
 *     checagem de bloco sem fechamento (`!endMatch`), que é específica
 *     dessa API e não faz parte da gramática pura.
 *
 * Regras exatas da gramática (ver `product-block-grammar.mjs` para o
 * detalhamento normativo):
 *   - Opener `:::product` no início da linha, sem indentação (trailing
 *     whitespace tolerado). Opener indentado não casa com esta sintaxe —
 *     continua sendo Markdown comum, tratado por outro caminho de
 *     importação, nunca por este transformer.
 *   - Corpo com exatamente 2 linhas, nesta ordem fixa: `version` primeiro,
 *     `productId` segundo. Nenhuma linha em branco interna. Nenhuma outra
 *     linha/campo.
 *   - `version` só aceita o literal "1" nesta v1.
 *   - `productId` validado como UUID (formato RFC 4122 canônico).
 *   - Closer `:::` obrigatório, sozinho na linha (trailing whitespace
 *     tolerado).
 *
 * Decisão fechada no desenho (não reabrir sem nova aprovação): uma vez que
 * o opener exato `:::product` foi reconhecido, qualquer desvio da gramática
 * acima — incluindo bloco sem fechamento — é uma FALHA EXPLÍCITA e
 * determinística (`ProductBlockSyntaxError` lançado dentro de
 * `PRODUCT_BLOCK.replace`), nunca um fallback silencioso para Markdown
 * comum. A exceção se propaga por `editor.update()` até o `onError` do
 * editor headless (mesmo padrão já usado em `round-trip.mjs` e
 * `compare-corpus.mjs`).
 *
 * Payload do node — decisão fechada: `ProductBlockNode` carrega, como
 * único estado editorial de domínio, `productId`. O `version` da gramática
 * Markdown pertence exclusivamente à camada de parsing (Lexical ou
 * remark) — nunca é armazenado como estado do node. Isso é conceitualmente
 * distinto da propriedade `version` que o próprio Lexical grava em todo
 * `LexicalNode.exportJSON()` (versionamento interno do formato de
 * serialização JSON do Lexical, sem nenhuma relação com a versão desta
 * sintaxe Markdown).
 *
 * `ProductBlockNode` referencia um `ArticleProduct` existente unicamente
 * por `productId`. Nenhum `offerId`, nome, preço, link ou snapshot é
 * armazenado — `ArticleProduct` continua sendo a única fonte estrutural de
 * verdade; Oferta continua resolvida dinamicamente a partir do Produto.
 *
 * `createState.parse` aqui é só normalização de tipo (mesmo padrão de
 * `listMarkerState`/`codeFenceState` em @lexical/markdown) — nunca um
 * mecanismo de rejeição de gramática. Toda validação de conteúdo acontece
 * em `parseProductBlockBody` (`product-block-grammar.mjs`), antes do node
 * ser criado.
 *
 * Node headless — sem DecoratorNode/React nesta tarefa (decisão fechada no
 * desenho).
 */

import { $applyNodeReplacement, ElementNode, createState, $getState, $setState } from 'lexical';
import {
  ProductBlockSyntaxError,
  parseProductBlockBody,
  serializeProductBlock,
} from './product-block-grammar.mjs';

export const PRODUCT_BLOCK_NODE_TYPE = 'product-block';

const productIdState = createState('productId', {
  parse: (value) => (typeof value === 'string' ? value : ''),
});

export class ProductBlockNode extends ElementNode {
  static getType() {
    return PRODUCT_BLOCK_NODE_TYPE;
  }

  static clone(node) {
    return new ProductBlockNode(node.__key);
  }

  // Nenhum `createDOM`/`updateDOM` é implementado aqui — decisão
  // arquitetural, não uma omissão.
  //
  // Contrato real (confirmado por leitura direta do código-fonte
  // instalado): `createHeadlessEditor` (`@lexical/headless`) marca todo
  // editor headless com `editor._headless = true`. Em `lexical` core
  // (`LexicalUpdates.ts`, `$commitPendingUpdatesImpl`),
  // `shouldSkipDOM = editor._headless || rootElement === null` — ou seja,
  // para QUALQUER editor headless, a reconciliação de DOM
  // (`$reconcileRoot`, único ponto que invoca `createDOM`/`updateDOM` de
  // um node) nunca roda, incondicionalmente. Isso não é uma
  // particularidade deste spike/teste: é o contrato documentado do modo
  // headless em si (reforçado por `setRootElement`/`getRootElement` serem
  // substituídos para lançar erro em `createHeadlessEditor`, tornando
  // impossível anexar uma raiz DOM real).
  //
  // `LexicalNode` (classe-base de `ElementNode`) já define `createDOM`/
  // `updateDOM` concretos que lançam
  // `invariant(false, 'createDOM: base method not extended')` quando não
  // sobrescritos. Herdar esse comportamento — em vez de fabricar uma
  // implementação que referencia `document`, inexistente neste contexto
  // headless/Node.js — preserva exatamente a propriedade pedida (o núcleo
  // do transformer/node não depende de DOM/browser) e falha alto e claro,
  // em vez de silenciosamente mal se comportar, caso este node seja um dia
  // reaproveitado em um editor real com renderização (fora do escopo da
  // UXE-003) sem que `createDOM`/`updateDOM` tenham sido implementados
  // primeiro.

  getProductId() {
    return $getState(this, productIdState);
  }

  setProductId(productId) {
    $setState(this, productIdState, productId);
    return this;
  }
}

export function $createProductBlockNode(productId) {
  const node = new ProductBlockNode();
  node.setProductId(productId);
  return $applyNodeReplacement(node);
}

export function $isProductBlockNode(node) {
  return node instanceof ProductBlockNode;
}

// Re-exportado para manter compatibilidade com quem já importa
// `ProductBlockSyntaxError` a partir deste arquivo (ex.:
// `product-block-round-trip.mjs`, UXE-003, intocado nesta tarefa).
export { ProductBlockSyntaxError };

export const PRODUCT_BLOCK = {
  dependencies: [ProductBlockNode],

  export: (node) => {
    if (!$isProductBlockNode(node)) {
      return null;
    }
    return serializeProductBlock(node.getProductId());
  },

  regExpStart: /^:::product[ \t]*$/,

  // `optional: true` é o que faz $importMultiline invocar `replace` mesmo
  // ao atingir o fim do documento sem encontrar o closer — com `endMatch`
  // ausente (`null`) nesse caso. Confirmado por leitura direta de
  // MarkdownImport.ts (@lexical/markdown@0.49.0) antes desta implementação.
  // Sem isso, um bloco sem fechamento nunca chegaria a `replace` e cairia
  // no fallback padrão do Lexical (linha do opener reprocessada como
  // Markdown comum) — exatamente o comportamento que a decisão de design
  // desta tarefa proíbe.
  regExpEnd: {
    optional: true,
    regExp: /^:::[ \t]*$/,
  },

  replace: (rootNode, children, startMatch, endMatch, linesInBetween) => {
    // A partir daqui, o opener `:::product` já casou. Qualquer retorno
    // `false` faria o Lexical tentar o próximo transformer e, no limite,
    // degradar a linha para texto — por isso todo caminho de rejeição
    // abaixo lança `ProductBlockSyntaxError` em vez de retornar `false`.
    //
    // Esta checagem é específica da API `MultilineElementTransformer`
    // (não existe conceito de "endMatch ausente" na gramática pura) —
    // por isso permanece aqui, e não em `product-block-grammar.mjs`.
    if (!endMatch) {
      throw new ProductBlockSyntaxError(
        'bloco sem fechamento (":::" ausente antes do fim do documento).',
      );
    }

    // `linesInBetween` inclui sempre uma entrada de borda no início e no
    // fim — o restante da linha do opener/closer depois do respectivo
    // match (aqui, sempre "" nesta gramática, já que `regExpStart`/
    // `regExpEnd` consomem a linha inteira até `$`; confirmado por
    // execução real contra MarkdownImport.ts). Essas duas entradas não
    // são conteúdo do corpo do bloco.
    const rawLines = linesInBetween ?? [];
    const bodyLines = rawLines.slice(1, -1);

    const { productId } = parseProductBlockBody(bodyLines);

    rootNode.append($createProductBlockNode(productId));

    return true;
  },

  type: 'multiline-element',
};
