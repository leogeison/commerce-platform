/**
 * packages/editorial/src/product-block/grammar.spec.ts
 *
 * UXE-017 — Plugin/transform do pipeline MDX do FastCompre.
 *
 * Suíte normativa da gramática `:::product` v1 (Editorial Serialization
 * Contract §3/§8) — a especificação única exigida pelo Contract, que
 * qualquer consumidor de produção (transformer Lexical em `apps/admin`,
 * plugin remark em `apps/fastcompre`) deve respeitar identicamente.
 *
 * Reproduz os mesmos 11 cenários normativos já provados em
 * `spikes/lexical-editorial/product-block-round-trip.mjs` (UXE-003) e em
 * `apps/admin/.../product-block/product-block.spec.ts` (UXE-006) — aqui,
 * porém, chamando `parseProductBlockBody`/`serializeProductBlock`
 * DIRETAMENTE, sem Lexical e sem MDX/remark: é o nível mais baixo possível
 * de verificação da gramática, sem nenhuma dependência de framework, o que
 * é exatamente o motivo de esta suíte viver neste package (`packages/editorial`
 * não pode importar nenhum dos dois). A suíte de `apps/admin` continua
 * existindo e sendo executada sem alteração de asserções — ela prova a
 * integração real com Lexical, não a gramática em si.
 */

import { describe, expect, it } from '@jest/globals';
import {
  CLOSER_REGEXP,
  OPENER_REGEXP,
  ProductBlockSyntaxError,
  parseProductBlockBody,
  serializeProductBlock,
} from './grammar';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Helper só desta suíte: reproduz a extração de "linhas de corpo" que tanto
 * o transformer Lexical (`linesInBetween.slice(1, -1)`) quanto o plugin
 * remark (`lines.slice(1, -1)`) já fazem antes de chamar
 * `parseProductBlockBody` — não é um terceiro parser, só isola o corpo de
 * um bloco completo (`:::product\n...\n:::`) para o teste poder chamar a
 * função de validação isoladamente.
 */
function bodyLinesOf(block: string): string[] {
  return block.split('\n').slice(1, -1);
}

describe('parseProductBlockBody / serializeProductBlock — 11 cenários normativos da gramática v1', () => {
  it('bloco-valido-isolado: parseia productId; serializeProductBlock produz a forma canônica byte-idêntica', () => {
    const block = `:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`;
    const { productId } = parseProductBlockBody(bodyLinesOf(block));

    expect(productId).toBe(VALID_UUID);
    expect(serializeProductBlock(productId)).toBe(block);
  });

  it('bloco-valido-cercado-por-markdown-comum: opener/closer reconhecidos independente do texto ao redor (via OPENER_REGEXP/CLOSER_REGEXP)', () => {
    // A gramática em si não conhece "texto ao redor" — só valida linha a
    // linha. Este cenário prova que os regexes de fronteira reconhecem o
    // opener/closer isoladamente, o que é a garantia que tanto o
    // transformer Lexical quanto o plugin remark dependem para SEGMENTAR
    // corretamente o documento antes de chamar `parseProductBlockBody`.
    expect(OPENER_REGEXP.test(':::product')).toBe(true);
    expect(CLOSER_REGEXP.test(':::')).toBe(true);

    const block = `:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`;
    const { productId } = parseProductBlockBody(bodyLinesOf(block));
    expect(productId).toBe(VALID_UUID);
  });

  it('opener-indentado-continua-markdown-comum (controle): opener indentado NUNCA casa com OPENER_REGEXP', () => {
    expect(OPENER_REGEXP.test('  :::product')).toBe(false);
  });

  it('version-ausente: fail-closed determinístico (ProductBlockSyntaxError), nunca fallback silencioso', () => {
    const block = `:::product\nproductId: ${VALID_UUID}\n:::`;
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('version-desconhecida: fail-closed determinístico', () => {
    const block = `:::product\nversion: 2\nproductId: ${VALID_UUID}\n:::`;
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('productId-ausente: fail-closed determinístico', () => {
    const block = ':::product\nversion: 1\n:::';
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('productId-uuid-invalido: fail-closed determinístico', () => {
    const block = ':::product\nversion: 1\nproductId: nao-e-um-uuid\n:::';
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('campo-linha-extra: fail-closed determinístico (corpo com mais de 2 linhas)', () => {
    const block = `:::product\nversion: 1\nproductId: ${VALID_UUID}\nname: Produto X\n:::`;
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('campo-duplicado: fail-closed determinístico (productId duplicado)', () => {
    const block = `:::product\nversion: 1\nproductId: ${VALID_UUID}\nproductId: ${VALID_UUID}\n:::`;
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('ordem-invalida: fail-closed determinístico (productId antes de version)', () => {
    const block = `:::product\nproductId: ${VALID_UUID}\nversion: 1\n:::`;
    expect(() => parseProductBlockBody(bodyLinesOf(block))).toThrow(ProductBlockSyntaxError);
  });

  it('bloco-sem-fechamento: fail-closed determinístico — CLOSER_REGEXP não casa com nenhuma linha do corpo', () => {
    // Sem closer, quem chama (transformer/plugin) nunca invoca
    // `parseProductBlockBody` — a rejeição acontece antes, na detecção de
    // fronteira. Este cenário prova o lado da gramática que ambos os
    // consumidores compartilham: nenhuma linha de um bloco genuinamente
    // sem fechamento casa com `CLOSER_REGEXP`.
    const bodyLines = [`version: 1`, `productId: ${VALID_UUID}`];
    expect(bodyLines.some((line) => CLOSER_REGEXP.test(line))).toBe(false);
  });
});
