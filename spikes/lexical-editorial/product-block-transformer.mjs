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
 * Regras exatas:
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
 * Markdown pertence exclusivamente a este transformer/parser — nunca é
 * armazenado como estado do node. Isso é conceitualmente distinto da
 * propriedade `version` que o próprio Lexical grava em todo
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
 * em `PRODUCT_BLOCK.replace`, antes do node ser criado.
 *
 * Node headless — sem DecoratorNode/React nesta tarefa (decisão fechada no
 * desenho). `createDOM`/`updateDOM` têm implementação mínima, exigida pela
 * classe-base `ElementNode`/`LexicalNode`, sem nenhum propósito visual
 * neste spike.
 */

import { $applyNodeReplacement, ElementNode, createState, $getState, $setState } from 'lexical';

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

export class ProductBlockSyntaxError extends Error {
  constructor(message) {
    super(`Sintaxe :::product inválida: ${message}`);
    this.name = 'ProductBlockSyntaxError';
  }
}

// Gramática v1 — regexes exatos por linha/posição fixa. Note que esta
// abordagem (posição fixa + contagem exata de 2 linhas) já enforça, sem
// checagens adicionais, várias regras da gramática ao mesmo tempo: campo
// extra ou linha em branco interna (contagem != 2), ordem trocada (a
// linha 1 só casa com VERSION_LINE_REGEXP, a linha 2 só com
// PRODUCT_ID_LINE_REGEXP) e campo duplicado do mesmo tipo na posição
// errada (ex.: duas linhas "productId:" faz a linha 1 falhar contra
// VERSION_LINE_REGEXP). Isso é intencional: a gramática v1 aprovada já é
// posicional e estrita, então validar por posição é a forma mais direta
// de espelhá-la — não uma simplificação que esconde casos.
const OPENER_REGEXP = /^:::product[ \t]*$/;
const CLOSER_REGEXP = /^:::[ \t]*$/;
const VERSION_LINE_REGEXP = /^version:\s*(.*?)\s*$/;
const PRODUCT_ID_LINE_REGEXP = /^productId:\s*(.*?)\s*$/;
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Versão da gramática Markdown suportada por este transformer — não é
// estado do node (ver nota no cabeçalho do arquivo).
const SUPPORTED_SYNTAX_VERSION = '1';

export const PRODUCT_BLOCK = {
  dependencies: [ProductBlockNode],

  export: (node) => {
    if (!$isProductBlockNode(node)) {
      return null;
    }
    return [
      ':::product',
      `version: ${SUPPORTED_SYNTAX_VERSION}`,
      `productId: ${node.getProductId()}`,
      ':::',
    ].join('\n');
  },

  regExpStart: OPENER_REGEXP,

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
    regExp: CLOSER_REGEXP,
  },

  replace: (rootNode, children, startMatch, endMatch, linesInBetween) => {
    // A partir daqui, o opener `:::product` já casou. Qualquer retorno
    // `false` faria o Lexical tentar o próximo transformer e, no limite,
    // degradar a linha para texto — por isso todo caminho de rejeição
    // abaixo lança `ProductBlockSyntaxError` em vez de retornar `false`.
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

    if (bodyLines.length !== 2) {
      throw new ProductBlockSyntaxError(
        `número de linhas inválido no corpo do bloco (esperado exatamente 2 — "version" e "productId", sem linhas em branco nem campos extras — encontrado ${bodyLines.length}).`,
      );
    }

    const [firstLine, secondLine] = bodyLines;

    const versionMatch = firstLine.match(VERSION_LINE_REGEXP);
    if (!versionMatch) {
      throw new ProductBlockSyntaxError(
        `primeira linha do corpo deve ser "version: <valor>" (recebido: ${JSON.stringify(firstLine)}).`,
      );
    }

    const productIdMatch = secondLine.match(PRODUCT_ID_LINE_REGEXP);
    if (!productIdMatch) {
      throw new ProductBlockSyntaxError(
        `segunda linha do corpo deve ser "productId: <valor>" (recebido: ${JSON.stringify(secondLine)}).`,
      );
    }

    const version = versionMatch[1];
    if (version !== SUPPORTED_SYNTAX_VERSION) {
      throw new ProductBlockSyntaxError(
        `versão de sintaxe não suportada (esperado "${SUPPORTED_SYNTAX_VERSION}", encontrado ${JSON.stringify(version)}).`,
      );
    }

    const productId = productIdMatch[1];
    if (!UUID_REGEXP.test(productId)) {
      throw new ProductBlockSyntaxError(
        `productId não é um UUID válido (recebido ${JSON.stringify(productId)}).`,
      );
    }

    rootNode.append($createProductBlockNode(productId));

    return true;
  },

  type: 'multiline-element',
};
