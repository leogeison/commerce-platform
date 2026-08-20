/**
 * spikes/lexical-editorial/product-block-remark-plugin.mjs
 *
 * UXE-004 — Round-trip 2 (bloco Produto/Oferta → sintaxe → pipeline
 * FastCompre → componente público).
 *
 * Plugin remark que reconhece, dentro da árvore mdast já parseada por
 * `remark-parse` (o parser padrão usado por `@mdx-js/mdx`), o mesmo bloco
 * `:::product` da UXE-003, e o reescreve como um `mdxJsxFlowElement`
 * referenciando o componente `ProductBlock`.
 *
 * Por que um parágrafo, e não um "container" dedicado: sob `format: 'md'`
 * (a mesma flag usada pelo pipeline real de produção, ver
 * `compile-article-body.ts`), `:::product`/`version: 1`/`productId: <uuid>`/
 * `:::` não tem nenhum significado sintático próprio em Markdown puro —
 * quatro linhas consecutivas sem linha em branco entre elas colapsam, pela
 * regra padrão do CommonMark, em um único parágrafo cujo único filho é um
 * nó `text` com `\n` preservado internamente (quebras leves). Isso foi
 * confirmado empiricamente antes desta implementação. Esta é, portanto, a
 * MESMA unidade estrutural que o transformer Lexical já trata via
 * `linesInBetween` — só que decomposta aqui a partir do valor bruto do nó
 * `text`, e não de uma varredura linha a linha do editor.
 *
 * Reuso da gramática: a extração de linhas (`OPENER_REGEXP`/`CLOSER_REGEXP`)
 * e toda a validação de corpo (`parseProductBlockBody`) vêm de
 * `product-block-grammar.mjs` — exatamente as mesmas usadas pelo
 * transformer Lexical (UXE-003). Nenhuma regra de gramática é reimplementada
 * aqui.
 *
 * Fail-closed, simétrico à decisão da UXE-003: uma vez que a primeira linha
 * do parágrafo casa com o opener exato `:::product`, qualquer desvio da
 * gramática — incluindo ausência do closer `:::` na última linha do mesmo
 * parágrafo — lança `ProductBlockSyntaxError`. Essa exceção se propaga pelo
 * visitor do `unified`/remark e, por consequência, rejeita a Promise
 * retornada por `evaluate()` — nunca um fallback silencioso para texto ou
 * para um parágrafo comum.
 *
 * Não-interferência: um parágrafo cuja primeira linha NÃO casa com o opener
 * é ignorado por este plugin e segue como Markdown comum, sem nenhuma
 * alteração — mesma garantia já provada pela UXE-002 para o corpus real e
 * verificada aqui novamente com o plugin presente (cenário 2 da matriz).
 *
 * Payload que atravessa para o `mdxJsxFlowElement`: SOMENTE `productId`,
 * como um único `mdxJsxAttribute`. Nenhum outro dado (nome, preço, link,
 * offerId) é lido ou propagado por este plugin — ele não tem acesso a
 * nenhuma fonte de dados; a resolução de Produto/Oferta acontece depois,
 * na renderização de `ProductBlock`, a partir da projeção estrutural real
 * do artigo (nunca aqui).
 */

import { visit } from 'unist-util-visit';
import { OPENER_REGEXP, CLOSER_REGEXP, parseProductBlockBody, ProductBlockSyntaxError } from './product-block-grammar.mjs';

export const PRODUCT_BLOCK_JSX_COMPONENT_NAME = 'ProductBlock';

/**
 * Extrai as linhas brutas de um nó `paragraph` candidato, ou `null` se o
 * parágrafo não tem a forma esperada (um único filho `text`) — nesse caso
 * ele definitivamente não é um bloco `:::product` e o plugin não deve nem
 * tentar interpretá-lo.
 */
function extractCandidateLines(paragraphNode) {
  const children = paragraphNode.children ?? [];
  if (children.length !== 1 || children[0].type !== 'text') {
    return null;
  }
  return children[0].value.split('\n');
}

export function remarkProductBlock() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || typeof index !== 'number') {
        return;
      }

      const lines = extractCandidateLines(node);
      if (!lines || lines.length === 0) {
        return;
      }

      if (!OPENER_REGEXP.test(lines[0])) {
        // Não é um bloco `:::product` — Markdown comum, intocado.
        return;
      }

      const lastLine = lines[lines.length - 1];
      if (lines.length < 2 || !CLOSER_REGEXP.test(lastLine)) {
        // Opener exato reconhecido, mas sem closer válido na última linha
        // do mesmo parágrafo — fail-closed, mesma semântica de "bloco sem
        // fechamento" da UXE-003 (lá detectada via `endMatch` ausente; aqui,
        // via ausência do closer dentro da unidade estrutural do mdast).
        throw new ProductBlockSyntaxError(
          'bloco sem fechamento (":::" ausente antes do fim do parágrafo/documento).',
        );
      }

      const bodyLines = lines.slice(1, -1);
      const { productId } = parseProductBlockBody(bodyLines);

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: PRODUCT_BLOCK_JSX_COMPONENT_NAME,
        attributes: [
          { type: 'mdxJsxAttribute', name: 'productId', value: productId },
        ],
        children: [],
      };
    });
  };
}
