/**
 * apps/admin/src/app/[siteSlug]/articles/split-body-into-segments.ts
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (preview Admin).
 *
 * Divide `bodyMdx` em segmentos ANTES de qualquer chamada a `evaluate()`
 * (`@mdx-js/mdx`) — decisão fechada no desenho desta tarefa, verificada
 * contra o código-fonte real instalado de `@mdx-js/mdx@3.1.1`
 * (`lib/core.js`): sob `format: 'md'` (o mesmo já usado por
 * `compileArticleBody`), `remarkMdx` nunca é adicionado ao pipeline e
 * `rehypeRemoveRaw` remove qualquer HTML/JSX cru — ou seja, injetar um
 * marcador `<ProductBlockPreview productId="..." />` dentro da própria
 * string Markdown ANTES de compilar NUNCA seria reconhecido como
 * componente; seria removido silenciosamente como HTML cru. Por isso a
 * única forma segura de renderizar o bloco de Produto fora do texto
 * compilado é dividir o `bodyMdx` em segmentos primeiro, compilar só os
 * segmentos de Markdown comum via `evaluate(..., { format: 'md' })`
 * (comportamento de segurança inalterado) e renderizar o segmento de
 * bloco de Produto diretamente via React, nunca através da string MDX.
 *
 * Usa SOMENTE `OPENER_REGEXP`/`CLOSER_REGEXP` (`./product-block/grammar`)
 * para detectar as fronteiras do bloco e delega 100% da validação do
 * corpo a `parseProductBlockBody` — nenhum parser concorrente. O
 * comportamento fail-closed (bloco sem fechamento, corpo inválido) é
 * equivalente ao do transformer Lexical (`./product-block/transformer.ts`,
 * intocado por esta tarefa): nunca passthrough literal, nunca fallback
 * silencioso — vira um segmento `'product-block-error'` explícito.
 *
 * `lineCount` (correção pós-revisão, ainda UXE-011): cada segmento de
 * bloco (`'product-block'`/`'product-block-error'`) carrega quantas
 * linhas do documento original ele ocupava. Único dado novo — nenhuma
 * mudança na detecção acima. Existe para permitir que
 * `compileArticleBody` construa uma projeção do documento (blocos
 * substituídos por linhas em branco de mesma contagem, Markdown
 * preservado verbatim) ao descobrir `definition`s de referência que
 * atravessam um bloco, sem duplicar esta função nem reimplementar a
 * detecção de bloco em outro módulo. `lineCount` já é 100% derivável do
 * que esta função já calcula (`closerIndex`/`index`/`lines.length`); não
 * é um dado novo obtido em outro lugar.
 */

import { CLOSER_REGEXP, OPENER_REGEXP, ProductBlockSyntaxError, parseProductBlockBody } from './product-block/grammar';

export type BodySegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'product-block'; productId: string; lineCount: number }
  | { type: 'product-block-error'; message: string; lineCount: number };

const UNCLOSED_BLOCK_MESSAGE = 'bloco sem fechamento (":::" ausente antes do fim do documento).';

export function splitBodyIntoSegments(bodyMdx: string): BodySegment[] {
  // Corpo vazio produz zero segmentos, nunca `[{ type: 'markdown', markdown:
  // '' }]` — decisão fechada no desenho aprovado desta tarefa (comprovado
  // por `compileArticleBody('')` nunca chamar `evaluate()`). Sem este caso
  // especial, `''.split('\n')` produz `['']` (um elemento, string vazia) —
  // indistinguível, no loop abaixo, de um documento com uma única linha em
  // branco de conteúdo real — e o buffer de Markdown acumulado seria
  // erroneamente `flush`ado como um segmento `'markdown'` com `markdown: ''`.
  if (bodyMdx === '') {
    return [];
  }

  const lines = bodyMdx.split('\n');
  const segments: BodySegment[] = [];
  let markdownBuffer: string[] = [];
  let index = 0;

  function flushMarkdown(): void {
    if (markdownBuffer.length > 0) {
      segments.push({ type: 'markdown', markdown: markdownBuffer.join('\n') });
      markdownBuffer = [];
    }
  }

  while (index < lines.length) {
    const line = lines[index]!;

    if (!OPENER_REGEXP.test(line)) {
      markdownBuffer.push(line);
      index++;
      continue;
    }

    flushMarkdown();

    const bodyLines: string[] = [];
    let closerIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (CLOSER_REGEXP.test(lines[cursor]!)) {
        closerIndex = cursor;
        break;
      }
      bodyLines.push(lines[cursor]!);
    }

    if (closerIndex === -1) {
      // Sem fechamento até o fim do documento — fail-closed determinístico
      // (mesmo comportamento do transformer Lexical), nunca reprocessado
      // como Markdown comum. Consome o restante do documento: não há mais
      // nada seguro para segmentar depois de um bloco malformado sem
      // fronteira conhecida. `lineCount` cobre da linha do opener até o
      // fim do documento (nada depois dele foi segmentado separadamente).
      segments.push({ type: 'product-block-error', message: UNCLOSED_BLOCK_MESSAGE, lineCount: lines.length - index });
      break;
    }

    // `lineCount` cobre da linha do opener (`index`) até a linha do closer
    // (`closerIndex`), inclusive — exatamente o intervalo de linhas do
    // documento original que este segmento de bloco ocupava.
    const blockLineCount = closerIndex - index + 1;

    try {
      const { productId } = parseProductBlockBody(bodyLines);
      segments.push({ type: 'product-block', productId, lineCount: blockLineCount });
    } catch (error) {
      const message = error instanceof ProductBlockSyntaxError ? error.message : 'Bloco de Produto inválido.';
      segments.push({ type: 'product-block-error', message, lineCount: blockLineCount });
    }

    index = closerIndex + 1;
  }

  flushMarkdown();
  return segments;
}
