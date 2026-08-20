/**
 * spikes/lexical-editorial/product-block-grammar.mjs
 *
 * UXE-004 — Round-trip 2 (bloco Produto/Oferta → sintaxe → pipeline
 * FastCompre → componente público).
 *
 * Extração MECÂNICA da validação pura da gramática `:::product` v1, hoje
 * duplicada implicitamente entre o transformer Lexical (UXE-003) e o novo
 * remark plugin (UXE-004). Este módulo não importa `lexical`, não importa
 * nada de `unist`/`mdx`/React, não faz I/O — é só a gramática, para poder
 * ser consumida identicamente pelas duas camadas.
 *
 * Nenhuma regra de validação foi alterada nesta extração: os regexes, a
 * mensagem de erro e a ordem de checagem são exatamente os que existiam em
 * `PRODUCT_BLOCK.replace`/`PRODUCT_BLOCK.export` de
 * `product-block-transformer.mjs` antes da UXE-004. A prova de que a
 * semântica não mudou é a repetição dos 11 cenários de
 * `product-block-round-trip.mjs` (UXE-003), que devem continuar 11/11 após
 * esta extração.
 */

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
export const OPENER_REGEXP = /^:::product[ \t]*$/;
export const CLOSER_REGEXP = /^:::[ \t]*$/;
export const VERSION_LINE_REGEXP = /^version:\s*(.*?)\s*$/;
export const PRODUCT_ID_LINE_REGEXP = /^productId:\s*(.*?)\s*$/;
export const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Versão da gramática Markdown suportada por este módulo — não é estado de
// nenhum node/AST; ver nota de payload em `product-block-transformer.mjs`.
export const PRODUCT_BLOCK_SYNTAX_VERSION = '1';

/**
 * Valida as linhas de CORPO de um bloco `:::product` já isoladas (sem a
 * linha do opener nem a linha do closer — quem chama já removeu essas
 * bordas, exatamente como `product-block-transformer.mjs` já fazia com
 * `linesInBetween.slice(1, -1)`).
 *
 * Lança `ProductBlockSyntaxError` em qualquer desvio da gramática v1.
 * Nunca retorna `false`/`null` como sinal de rejeição — decisão fechada
 * desde a UXE-003, preservada aqui: falha é sempre uma exceção explícita.
 *
 * @param {string[]} bodyLines
 * @returns {{ productId: string }}
 */
export function parseProductBlockBody(bodyLines) {
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
  if (version !== PRODUCT_BLOCK_SYNTAX_VERSION) {
    throw new ProductBlockSyntaxError(
      `versão de sintaxe não suportada (esperado "${PRODUCT_BLOCK_SYNTAX_VERSION}", encontrado ${JSON.stringify(version)}).`,
    );
  }

  const productId = productIdMatch[1];
  if (!UUID_REGEXP.test(productId)) {
    throw new ProductBlockSyntaxError(
      `productId não é um UUID válido (recebido ${JSON.stringify(productId)}).`,
    );
  }

  return { productId };
}

/**
 * Serializa um `productId` já validado de volta para a forma canônica do
 * bloco `:::product` v1. Espelha exatamente `PRODUCT_BLOCK.export` de
 * `product-block-transformer.mjs` antes da extração.
 *
 * @param {string} productId
 * @returns {string}
 */
export function serializeProductBlock(productId) {
  return [
    ':::product',
    `version: ${PRODUCT_BLOCK_SYNTAX_VERSION}`,
    `productId: ${productId}`,
    ':::',
  ].join('\n');
}
