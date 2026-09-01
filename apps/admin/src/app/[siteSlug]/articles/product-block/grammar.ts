/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/grammar.ts
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * Porte para TypeScript da gramática normativa `:::product` v1, validada
 * pelo Editorial Serialization Contract (`docs/editorial/editorial-serialization-contract.md`,
 * §3) e implementada originalmente em
 * `spikes/lexical-editorial/product-block-grammar.mjs` (UXE-004).
 *
 * Nenhuma regra de validação, mensagem de erro ou ordem de checagem foi
 * alterada nesta porta — só a sintaxe (JS → TS com tipos). Por decisão do
 * Contract §8 (nenhum `packages/editorial-syntax` nesta tarefa — UXE-006 é
 * o primeiro consumidor de produção), esta cópia vive localmente em
 * `apps/admin`; sua aderência à especificação normativa é comprovada pela
 * suíte `product-block.spec.ts`, que reproduz os 11 cenários de
 * `product-block-round-trip.mjs`.
 */

export class ProductBlockSyntaxError extends Error {
  constructor(message: string) {
    super(`Sintaxe :::product inválida: ${message}`);
    this.name = 'ProductBlockSyntaxError';
  }
}

// Gramática v1 — regexes exatos por linha/posição fixa. Ver o racional
// completo (por que posição fixa já cobre campo extra, ordem trocada e
// campo duplicado) em `product-block-grammar.mjs` (UXE-004) — não repetido
// aqui para não divergir de comentário sem controle de origem.
export const OPENER_REGEXP = /^:::product[ \t]*$/;
export const CLOSER_REGEXP = /^:::[ \t]*$/;
export const VERSION_LINE_REGEXP = /^version:\s*(.*?)\s*$/;
export const PRODUCT_ID_LINE_REGEXP = /^productId:\s*(.*?)\s*$/;
export const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Versão da gramática Markdown suportada por este módulo — não é estado de
// nenhum node/AST; ver nota de payload em `node.ts`.
export const PRODUCT_BLOCK_SYNTAX_VERSION = '1';

export interface ParsedProductBlockBody {
  productId: string;
}

/**
 * Valida as linhas de CORPO de um bloco `:::product` já isoladas (sem a
 * linha do opener nem a linha do closer). Lança `ProductBlockSyntaxError`
 * em qualquer desvio da gramática v1 — nunca retorna `false`/`null` como
 * sinal de rejeição (comportamento fail-closed, Contract §3).
 */
export function parseProductBlockBody(bodyLines: string[]): ParsedProductBlockBody {
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
    throw new ProductBlockSyntaxError(`productId não é um UUID válido (recebido ${JSON.stringify(productId)}).`);
  }

  return { productId };
}

/**
 * Serializa um `productId` já validado de volta para a forma canônica do
 * bloco `:::product` v1.
 */
export function serializeProductBlock(productId: string): string {
  return [':::product', `version: ${PRODUCT_BLOCK_SYNTAX_VERSION}`, `productId: ${productId}`, ':::'].join('\n');
}
