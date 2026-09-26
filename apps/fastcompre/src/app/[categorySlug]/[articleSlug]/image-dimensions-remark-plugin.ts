/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/image-dimensions-remark-plugin.ts
 *
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: extensão
 * de dimensões `{width=N}`/`{width=N height=M}` (Editorial Serialization
 * Contract §10). Adapter do pipeline MDX público do FastCompre
 * (`./compile-article-body.ts`).
 *
 * Renomeado nesta rodada de `image-width-remark-plugin.ts` (só largura)
 * — `remarkImageWidth` → `remarkImageDimensions`.
 *
 * Reconhece, dentro da árvore mdast já parseada por `remark-parse`, um nó
 * `image` seguido, na MESMA lista de filhos de um `paragraph`, por um nó
 * `text` irmão imediato cujo valor casa exatamente `{width=N}` ou
 * `{width=N height=M}` válidos (`parseImageDimensionsExtension`,
 * `@commerce-platform/editorial`) — e, só nesse caso, anexa `width` (e,
 * quando presente, `height`) a `image.data.hProperties`, consumindo
 * (removendo) o nó de texto da extensão. Mesma evidência mdast real e
 * mesmo mecanismo `data.hProperties`/`hProperties.style` já documentados
 * em `apps/admin/.../article-body-image/image-dimensions-remark-plugin.ts`
 * (o adapter equivalente do Preview do Admin) — não repetidos aqui por
 * inteiro para não divergir de comentário sem controle de origem; ver
 * aquele arquivo para o racional completo da verificação empírica da
 * técnica `aspect-ratio`.
 *
 * `unist-util-visit` (não uma varredura manual de `tree.children`) —
 * mesmo critério já registrado em `./product-block-remark-plugin.ts`:
 * uma imagem candidata pode existir em profundidades diferentes da
 * árvore mdast (citação, item de lista), e `unist-util-visit@5.1.0` já é
 * dependência direta do FastCompre (ao contrário do Admin — ver o adapter
 * irmão para o racional de por que ESSE app usa varredura manual em vez
 * de `unist-util-visit`, evitando uma dependência nova que ali não
 * existe).
 *
 * Fonte física única da extração/validação: `parseImageDimensionsExtension`
 * (`@commerce-platform/editorial`) — nenhuma regra de gramática é
 * reimplementada aqui. Os três consumidores (este adapter, o adapter do
 * Preview do Admin, o transformer Lexical do Admin) são verificados
 * contra o MESMO corpus normativo (`IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`,
 * `@commerce-platform/editorial`) — ver `image-dimensions-remark-plugin.spec.ts`,
 * neste mesmo diretório.
 *
 * Não-interferência: um parágrafo sem nenhum nó `image`, ou uma imagem
 * sem nó `text` irmão imediato, ou cujo texto irmão não casa a extensão,
 * atravessa este plugin sem nenhuma alteração — nunca lança (mesma
 * semântica "casa ou não casa", nunca fail-closed por exceção, distinta
 * de `:::product`/Ponto 2 — ver `product-block-remark-plugin.ts`).
 */

import { visit } from 'unist-util-visit';
import { parseImageDimensionsExtension } from '@commerce-platform/editorial';

interface MdastTextNode {
  type: 'text';
  value: string;
}

interface MdastImageNode {
  type: 'image';
  data?: { hProperties?: Record<string, unknown> };
}

interface MdastParagraphNode {
  type: 'paragraph';
  children?: unknown[];
}

function isTextNode(node: unknown): node is MdastTextNode {
  return typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'text';
}

function isImageNode(node: unknown): node is MdastImageNode {
  return typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'image';
}

export function remarkImageDimensions() {
  return (tree: unknown) => {
    visit(tree as never, 'paragraph', (node: unknown) => {
      const paragraphNode = node as MdastParagraphNode;
      const children = paragraphNode.children;
      if (!Array.isArray(children)) {
        return;
      }

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
        const existingHProperties = candidate.data?.hProperties ?? {};
        const dimensionHProperties: Record<string, unknown> =
          dimensions.height === undefined
            ? { width: dimensions.width }
            : {
                width: dimensions.width,
                height: dimensions.height,
                style: `aspect-ratio: ${dimensions.width} / ${dimensions.height}; width: 100%; max-width: ${dimensions.width}px; height: auto;`,
              };
        candidate.data = { ...candidate.data, hProperties: { ...existingHProperties, ...dimensionHProperties } };
        children.splice(index + 1, 1);
      }
    });
  };
}
