/**
 * apps/admin/src/app/[siteSlug]/articles/split-body-into-segments.spec.ts
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (preview Admin).
 *
 * Testes unitários puros para `splitBodyIntoSegments` — sem React/Lexical.
 * Cobre fronteiras de segmento (Markdown puro, bloco único, misto),
 * comportamento fail-closed de bloco sem fechamento e delegação total da
 * validação do corpo a `parseProductBlockBody` (nenhuma regra duplicada
 * aqui).
 *
 * `lineCount` (correção pós-revisão, ainda UXE-011): todo segmento de
 * bloco (`'product-block'`/`'product-block-error'`) agora também carrega
 * quantas linhas do documento original ocupava — dado usado só por
 * `compileArticleBody` para projetar o documento ao descobrir `definition`s
 * de referência que atravessam um bloco (ver `compile-article-body.ts`).
 * As asserções abaixo foram atualizadas para incluir esse campo — mudança
 * de forma legítima desta mesma tarefa, nenhuma regra de detecção mudou.
 */

import { describe, expect, it } from '@jest/globals';
import { splitBodyIntoSegments } from './split-body-into-segments';

const VALID_ID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const VALID_ID_B = 'bbbbbbbb-2222-4222-8222-222222222222';

describe('splitBodyIntoSegments', () => {
  it('corpo vazio produz nenhum segmento', () => {
    expect(splitBodyIntoSegments('')).toEqual([]);
  });

  it('Markdown puro (sem nenhum bloco) produz um único segmento "markdown" com o texto inalterado', () => {
    const body = '# Título\n\nUm parágrafo com **negrito**.';
    expect(splitBodyIntoSegments(body)).toEqual([{ type: 'markdown', markdown: body }]);
  });

  it('um único bloco de Produto válido, sozinho, produz apenas um segmento "product-block" (4 linhas: opener + 2 de corpo + closer)', () => {
    const body = `:::product\nversion: 1\nproductId: ${VALID_ID_A}\n:::`;
    expect(splitBodyIntoSegments(body)).toEqual([{ type: 'product-block', productId: VALID_ID_A, lineCount: 4 }]);
  });

  it('Markdown antes e depois de um bloco produz três segmentos na ordem correta', () => {
    const body = [
      'Antes do bloco.',
      '',
      ':::product',
      'version: 1',
      `productId: ${VALID_ID_A}`,
      ':::',
      '',
      'Depois do bloco.',
    ].join('\n');

    expect(splitBodyIntoSegments(body)).toEqual([
      { type: 'markdown', markdown: 'Antes do bloco.\n' },
      { type: 'product-block', productId: VALID_ID_A, lineCount: 4 },
      { type: 'markdown', markdown: '\nDepois do bloco.' },
    ]);
  });

  it('dois blocos de Produto separados por Markdown produzem cinco segmentos, cada bloco resolvido independentemente', () => {
    const body = [
      ':::product',
      'version: 1',
      `productId: ${VALID_ID_A}`,
      ':::',
      'Entre os dois blocos.',
      ':::product',
      'version: 1',
      `productId: ${VALID_ID_B}`,
      ':::',
    ].join('\n');

    expect(splitBodyIntoSegments(body)).toEqual([
      { type: 'product-block', productId: VALID_ID_A, lineCount: 4 },
      { type: 'markdown', markdown: 'Entre os dois blocos.' },
      { type: 'product-block', productId: VALID_ID_B, lineCount: 4 },
    ]);
  });

  it('bloco sem fechamento até o fim do documento: fail-closed — vira um único segmento "product-block-error", nunca passthrough literal do Markdown já acumulado depois dele', () => {
    const body = ['Texto antes.', ':::product', 'version: 1', `productId: ${VALID_ID_A}`].join('\n');

    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([
      { type: 'markdown', markdown: 'Texto antes.' },
      {
        type: 'product-block-error',
        message: 'bloco sem fechamento (":::" ausente antes do fim do documento).',
        lineCount: 3,
      },
    ]);
  });

  it('corpo de bloco inválido delega a mensagem de erro a `parseProductBlockBody` (nenhuma regra duplicada aqui)', () => {
    const body = [':::product', 'version: 2', `productId: ${VALID_ID_A}`, ':::'].join('\n');

    const segments = splitBodyIntoSegments(body);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'product-block-error', lineCount: 4 });
    if (segments[0]!.type === 'product-block-error') {
      expect(segments[0]!.message).toContain('versão de sintaxe não suportada');
    }
  });

  it('productId sintaticamente inválido (não-UUID) também vira segmento de erro, não passthrough', () => {
    const body = [':::product', 'version: 1', 'productId: nao-e-um-uuid', ':::'].join('\n');

    const segments = splitBodyIntoSegments(body);
    expect(segments[0]).toMatchObject({ type: 'product-block-error', lineCount: 4 });
    if (segments[0]!.type === 'product-block-error') {
      expect(segments[0]!.message).toContain('não é um UUID válido');
    }
  });

  it('um bloco malformado no meio do documento consome o restante como erro e não tenta ressegmentar depois dele', () => {
    const body = [
      'Início.',
      ':::product',
      'version: 1',
      // Sem productId nem fechamento — nunca encontra CLOSER_REGEXP.
      'Isso deveria ter sido fechado com ":::" mas não foi.',
      'Mais texto que jamais será tratado como Markdown comum.',
    ].join('\n');

    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([
      { type: 'markdown', markdown: 'Início.' },
      {
        type: 'product-block-error',
        message: 'bloco sem fechamento (":::" ausente antes do fim do documento).',
        lineCount: 4,
      },
    ]);
  });

  it('linhas que só parecem um opener (com sufixo) não são tratadas como bloco — seguem como Markdown comum', () => {
    const body = ':::productivity\nisso não é um bloco de produto.';
    expect(splitBodyIntoSegments(body)).toEqual([{ type: 'markdown', markdown: body }]);
  });
});
