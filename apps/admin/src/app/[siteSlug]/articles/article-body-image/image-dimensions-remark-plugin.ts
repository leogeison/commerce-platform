/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-dimensions-remark-plugin.ts
 *
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: extensão
 * de dimensões `{width=N}`/`{width=N height=M}` (Editorial Serialization
 * Contract §10). Adapter do pipeline MDX do Preview do Admin
 * (`../compile-article-body.ts`).
 *
 * Renomeado nesta rodada de `image-width-remark-plugin.ts` (só largura)
 * — `remarkImageWidth` → `remarkImageDimensions`.
 *
 * Reconhece, dentro da árvore mdast já parseada por `remark-parse` (o
 * parser padrão usado por `@mdx-js/mdx` mesmo sob `format: 'md'`), um nó
 * `image` seguido, na MESMA lista de filhos de um `paragraph`, por um nó
 * `text` irmão imediato cujo valor casa exatamente `{width=N}` ou
 * `{width=N height=M}` válidos (`parseImageDimensionsExtension`,
 * `@commerce-platform/editorial`) — e, só nesse caso, anexa `width` (e,
 * quando presente, `height`) a `image.data.hProperties`, consumindo
 * (removendo) o nó de texto da extensão. Evidência real desta estrutura
 * (`image` + `text` irmão, nunca um único nó combinado) inspecionada
 * diretamente contra `@mdx-js/mdx@3.1.1` para os casos do Contract §10
 * antes da aprovação do contrato.
 *
 * `hProperties.style` — forma combinada (`width`+`height`) apenas: além
 * de `width`/`height` numéricos (mesmo mecanismo já usado desde a
 * primeira rodada desta tarefa para `width` sozinho), anexa também
 * `style` como STRING CSS (`aspect-ratio: W / H; width: 100%; max-width:
 * Wpx; height: auto;`) — a técnica confirmada empiricamente (prova real
 * registrada no relatório desta tarefa, com `evaluate()` real +
 * `renderToStaticMarkup` real + Chromium real) como a ÚNICA forma que
 * preserva a proporção PERSISTIDA (nunca a intrínseca real do arquivo)
 * ao encolher em viewports estreitos — `width`/`height` nativos sozinhos
 * sempre cedem para a proporção intrínseca real assim que a imagem
 * carrega. A mesma prova confirmou que `mdast-util-to-hast` (usado
 * internamente por `@mdx-js/mdx`) converte corretamente um `style`
 * STRING em objeto antes de chegar ao React — nunca repassado cru
 * (evita o erro clássico "style prop expects a mapping, not a string").
 * A forma só-`width` permanece INALTERADA desta rodada (só `width`
 * numérico, sem `height`, sem `style`) — nenhuma imagem legada que já
 * tinha só `width` precisa de migração visual.
 *
 * Travessia manual de `tree.children` (não `unist-util-visit`) —
 * DELIBERADO, mesmo critério já registrado em
 * `../compile-article-body.ts` (`collectDefinitions`): `unist-util-visit`
 * não é dependência direta do Admin hoje (confirmado: só está em
 * `apps/fastcompre/package.json`, não em `apps/admin/package.json` nem
 * resolvível no `node_modules` do Admin) — esta correção, como aquela,
 * não introduz nenhuma dependência nova (nem só de tipos) para o Preview
 * do Admin. Só parágrafos de nível único de profundidade abaixo de cada
 * node são percorridos recursivamente (mesmo padrão de
 * `collectDefinitions`) — suficiente para o mesmo motivo já documentado
 * lá: uma imagem candidata pode existir em profundidades diferentes da
 * árvore (citação, item de lista), e a travessia recursiva cobre
 * qualquer uma delas.
 *
 * Fonte física única da extração/validação: `parseImageDimensionsExtension`
 * (`@commerce-platform/editorial`) — nenhuma regra de gramática é
 * reimplementada aqui, mesmo critério já usado pelo transformer Lexical
 * (`./transformer.ts`) e pelo adapter equivalente do FastCompre
 * (`apps/fastcompre/.../image-dimensions-remark-plugin.ts`). Os três
 * consumidores são verificados contra o MESMO corpus normativo
 * (`IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`, `@commerce-platform/editorial`)
 * — ver `image-dimensions-remark-plugin.spec.ts`, neste mesmo diretório.
 *
 * Não-interferência: um parágrafo sem nenhum nó `image`, ou uma imagem
 * sem nó `text` irmão imediato, ou cujo texto irmão não casa a extensão,
 * atravessa este plugin sem nenhuma alteração — nunca lança (mesma
 * semântica "casa ou não casa", nunca fail-closed por exceção, distinta
 * de `:::product`/Ponto 2).
 */

import { parseImageDimensionsExtension } from '@commerce-platform/editorial';

/**
 * Forma mínima, local, de `data` de um nó mdast — compatível com
 * `hProperties` conforme usado por `mdast-util-to-hast` (ver racional
 * empírico no topo do arquivo), sem importar `@types/mdast`/
 * `mdast-util-*` (nenhum dos dois é dependência direta do Admin —
 * mesma decisão já registrada acima para `unist-util-visit`). Outras
 * chaves de `data` que a árvore real já traga (ex.: `hName`) continuam
 * preservadas pelo spread abaixo mesmo sem estarem tipadas aqui — esta
 * interface só precisa nomear o campo que este arquivo efetivamente lê.
 */
interface MdastNodeData {
  hProperties?: Record<string, unknown>;
}

interface MdastNode {
  type?: unknown;
  value?: unknown;
  data?: MdastNodeData;
  children?: unknown[];
}

function isRecord(value: unknown): value is MdastNode {
  return typeof value === 'object' && value !== null;
}

function isTextNode(node: unknown): node is { type: 'text'; value: string } {
  return isRecord(node) && node.type === 'text' && typeof node.value === 'string';
}

function isImageNode(node: unknown): node is MdastNode & { type: 'image' } {
  return isRecord(node) && node.type === 'image';
}

/**
 * Processa os filhos de um `paragraph` candidato em busca de pares
 * `image` + `text` irmão imediato — muta `children` em vigor (mesmo
 * padrão de mutação in-place já usado pelo plugin equivalente do
 * FastCompre, via `unist-util-visit`, e por `remarkProductBlock`).
 */
function processParagraphChildren(children: unknown[]): void {
  for (let index = 0; index < children.length; index++) {
    const candidate = children[index];
    if (!isImageNode(candidate)) {
      continue;
    }
    const next = children[index + 1];
    if (!isTextNode(next)) {
      continue;
    }
    const dimensions = parseImageDimensionsExtension(next.value);
    if (dimensions === null) {
      continue;
    }
    const existingData: MdastNodeData = candidate.data ?? {};
    const existingHProperties = existingData.hProperties ?? {};
    const dimensionHProperties: Record<string, unknown> =
      dimensions.height === undefined
        ? { width: dimensions.width }
        : {
            width: dimensions.width,
            height: dimensions.height,
            style: `aspect-ratio: ${dimensions.width} / ${dimensions.height}; width: 100%; max-width: ${dimensions.width}px; height: auto;`,
          };
    candidate.data = { ...existingData, hProperties: { ...existingHProperties, ...dimensionHProperties } };
    children.splice(index + 1, 1);
  }
}

function walk(node: unknown): void {
  if (!isRecord(node)) {
    return;
  }
  if (node.type === 'paragraph' && Array.isArray(node.children)) {
    processParagraphChildren(node.children);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child);
    }
  }
}

export function remarkImageDimensions() {
  return (tree: unknown) => {
    walk(tree);
  };
}
