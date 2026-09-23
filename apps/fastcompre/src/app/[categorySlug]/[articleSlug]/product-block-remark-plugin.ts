/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-remark-plugin.ts
 *
 * UXE-017 — Plugin/transform do pipeline MDX do FastCompre.
 *
 * Reconhece, dentro da árvore mdast já parseada por `remark-parse` (o
 * parser padrão usado por `@mdx-js/mdx` mesmo sob `format: 'md'`), o
 * mesmo bloco `:::product` já normativo desde a UXE-003, e o reescreve
 * como um `mdxJsxFlowElement` referenciando o componente `ProductBlock`.
 * Porte direto de `spikes/lexical-editorial/product-block-remark-plugin.mjs`
 * (UXE-004) para produção — nenhuma regra nova, só a origem da gramática
 * (agora `@commerce-platform/editorial`, não uma cópia local) e tipos TS.
 *
 * Escopo desta tarefa (UXE-017), estreito por decisão explícita: este
 * módulo só faz o `productId` (já validado como UUID pela gramática)
 * atravessar até o `mdxJsxFlowElement` — nunca resolve, importa ou
 * referencia nenhuma fonte de dado de Produto/Oferta, nunca cria um
 * componente `ProductBlock` de produção, e nunca é conectado a
 * `page.tsx`. Resolução real contra `PublicArticle.products[]` e a
 * decisão sobre a seção estática de Produtos são explicitamente
 * responsabilidade da UXE-018 (Editorial Serialization Contract §5/§6).
 *
 * Por que um parágrafo, e não um "container" dedicado: sob `format: 'md'`
 * (a mesma flag usada pelo pipeline real, ver `compile-article-body.ts`),
 * `:::product`/`version: 1`/`productId: <uuid>`/`:::` não tem nenhum
 * significado sintático próprio em Markdown puro — quatro linhas
 * consecutivas sem linha em branco entre elas colapsam, pela regra padrão
 * do CommonMark, em um único parágrafo cujo único filho é um nó `text`
 * com `\n` preservado internamente (quebras leves) — confirmado
 * empiricamente na UXE-004 e reconfirmado pela prova standalone desta
 * tarefa (`product-block-remark-plugin.standalone-proof.mjs`).
 *
 * `unist-util-visit` (não uma varredura manual de `tree.children`): um
 * parágrafo candidato pode existir em profundidades diferentes da árvore
 * mdast (por exemplo, dentro de uma citação ou item de lista — o parser
 * já normaliza a indentação/prefixo antes do texto do parágrafo chegar ao
 * node). Como `bodyMdx` é só uma string, sem garantia de que só o editor
 * Lexical a produziu, o comportamento fail-closed da gramática exige
 * reconhecer o padrão onde quer que ele estruturalmente ocorra — uma
 * varredura manual só da raiz deixaria essa classe de caso como um ponto
 * cego não intencional. `unist-util-visit@5.1.0` já é dependência
 * transitiva de `@mdx-js/mdx` (confirmado no lockfile do monorepo) —
 * declará-la como dependência direta do FastCompre não adiciona nenhuma
 * resolução nova à árvore de dependências.
 *
 * Reuso da gramática: a extração de linhas (`OPENER_REGEXP`/`CLOSER_REGEXP`)
 * e toda a validação de corpo (`parseProductBlockBody`) vêm de
 * `@commerce-platform/editorial` — a mesma fonte física única consumida
 * pelo transformer Lexical do Admin (`apps/admin/.../product-block/transformer.ts`).
 * Nenhuma regra de gramática é reimplementada aqui.
 *
 * Fail-closed, simétrico à UXE-003/UXE-006: uma vez que a primeira linha
 * do parágrafo casa com o opener exato `:::product`, qualquer desvio da
 * gramática — incluindo ausência do closer `:::` na última linha do mesmo
 * parágrafo — lança `ProductBlockSyntaxError`. Essa exceção se propaga
 * pelo visitor do `unified`/remark e, por consequência, rejeita a Promise
 * retornada por `evaluate()` — nunca um fallback silencioso para texto ou
 * para um parágrafo comum. Nenhum `try/catch` foi adicionado em volta
 * disso nesta tarefa — decisão explícita: a semântica normativa do
 * Contract §3 é preservada exatamente, incluindo o efeito de propagação
 * até quem chama `compileArticleBody` (hoje, `page.tsx`, intocado por
 * esta tarefa).
 *
 * Não-interferência: um parágrafo cuja primeira linha NÃO casa com o
 * opener é ignorado por este plugin e segue como Markdown comum, sem
 * nenhuma alteração.
 *
 * Payload que atravessa para o `mdxJsxFlowElement`: SOMENTE `productId`,
 * como um único `mdxJsxAttribute`. Nenhum outro dado (nome, preço, link,
 * offerId) é lido ou propagado por este plugin.
 *
 * UXW-011 — `referencedProductIds` (parâmetro opcional, sem valor
 * default além de nenhum efeito quando omitido): coletor mutado por
 * referência, populado com `productId` **somente** no caminho de
 * sucesso (depois de `parseProductBlockBody` já ter validado o bloco) —
 * nunca antes de uma rejeição fail-closed, nunca como parte da própria
 * gramática/Contract, que continuam exatamente como estavam. Existe para
 * que `compileArticleBody` (único chamador real) saiba, sem um segundo
 * parse de `bodyMdx`, quais Produtos foram referenciados inline — usado
 * por `page.tsx` só para excluir da seção estática de Produtos os já
 * exibidos inline (Editorial Serialization Contract §6, ADENDO UXE-018).
 * Um `Set` (não uma lista) porque o único uso desse dado é teste de
 * pertencimento; o mesmo `productId` aparecendo duas vezes no `bodyMdx`
 * soma uma única entrada, sem efeito nas duas transformações
 * `mdxJsxFlowElement` independentes que continuam acontecendo normalmente.
 */

import { visit } from 'unist-util-visit';
import {
  OPENER_REGEXP,
  CLOSER_REGEXP,
  parseProductBlockBody,
  ProductBlockSyntaxError,
} from '@commerce-platform/editorial';

export const PRODUCT_BLOCK_JSX_COMPONENT_NAME = 'ProductBlock';

interface MdastTextNode {
  type: 'text';
  value: string;
}

interface MdastParagraphNode {
  type: 'paragraph';
  children?: unknown[];
}

interface MdastParentNode {
  children: unknown[];
}

function isTextNode(node: unknown): node is MdastTextNode {
  return typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'text';
}

/**
 * Extrai as linhas brutas de um nó `paragraph` candidato, ou `null` se o
 * parágrafo não tem a forma esperada (um único filho `text`) — nesse caso
 * ele definitivamente não é um bloco `:::product` e o plugin não deve nem
 * tentar interpretá-lo.
 */
function extractCandidateLines(paragraphNode: MdastParagraphNode): string[] | null {
  const children = paragraphNode.children ?? [];
  if (children.length !== 1 || !isTextNode(children[0])) {
    return null;
  }
  return children[0].value.split('\n');
}

export function remarkProductBlock(referencedProductIds?: Set<string>) {
  return (tree: unknown) => {
    visit(tree as never, 'paragraph', (node: unknown, index: number | undefined, parent: unknown) => {
      if (!parent || typeof index !== 'number') {
        return;
      }

      const lines = extractCandidateLines(node as MdastParagraphNode);
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
        // fechamento" já normativa desde a UXE-003/UXE-006.
        throw new ProductBlockSyntaxError(
          'bloco sem fechamento (":::" ausente antes do fim do parágrafo/documento).',
        );
      }

      const bodyLines = lines.slice(1, -1);
      const { productId } = parseProductBlockBody(bodyLines);
      referencedProductIds?.add(productId);

      (parent as MdastParentNode).children[index] = {
        type: 'mdxJsxFlowElement',
        name: PRODUCT_BLOCK_JSX_COMPONENT_NAME,
        attributes: [{ type: 'mdxJsxAttribute', name: 'productId', value: productId }],
        children: [],
      };
    });
  };
}
