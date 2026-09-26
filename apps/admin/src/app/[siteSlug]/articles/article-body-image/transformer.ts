/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/transformer.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade (gramática base).
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: extensão
 * de dimensões `{width=N}`/`{width=N height=M}` (Editorial Serialization
 * Contract §10).
 *
 * `IMAGE` — `ElementTransformer` (não `multiline-element`: a sintaxe de
 * imagem é sempre uma única linha).
 *
 * `regExp` é `IMAGE_BASE_REGEXP` (`@commerce-platform/editorial`), que
 * NÃO âncora o fim da linha (diferente do antigo `IMAGE_LINE_REGEXP`
 * local, âncorado `^...$`). Verificado diretamente contra o código-fonte
 * real instalado de `@lexical/markdown@0.49.0` (`MarkdownImport.ts`,
 * `$importBlocks`): o mecanismo de importação SEMPRE calcula o restante
 * da linha após o match
 * (`textNode.setTextContent(lineText.slice(match[0].length))`) e passa
 * esse restante como `children[0]` para `replace()` — nunca exigiu que o
 * regex casasse a linha inteira. Com `IMAGE_BASE_REGEXP` desanchorado,
 * `children[0]` carrega exatamente "o que sobrou da linha depois da
 * imagem" — a mesma evidência mdast do Contract §10 (a imagem é sempre
 * reconhecida, independentemente do que a segue).
 *
 * `replace()` decide o que fazer com esse restante:
 * - vazio → nenhuma extensão, comportamento idêntico à UXE-010: o
 *   parágrafo inteiro (`parentNode`, já contendo só essa imagem) é
 *   substituído pela `ImageNode`;
 * - casa `{width=N}` ou `{width=N height=M}` válidos
 *   (`parseImageDimensionsExtension`, `@commerce-platform/editorial`) →
 *   consumido como `width` (e `height`, quando presente) da imagem,
 *   mesmo caminho de substituição do parágrafo inteiro (nada resta a
 *   preservar). `width` sozinho usa `ImageNode.setWidth`; `width`+
 *   `height` usa `ImageNode.setDimensions` (o único mutador capaz de
 *   gravar `height` — ver `node.ts`) — nunca `setWidth` seguido de uma
 *   chamada separada para `height`, que violaria a atomicidade já
 *   normativa na gramática para a extensão combinada;
 * - qualquer outra coisa (extensão ausente-mas-não-vazia, inválida, fora
 *   da faixa em qualquer eixo, com lixo à direita) → a extensão NÃO é
 *   consumida (Contract §10: "não é consumido pela extensão... a imagem
 *   permanece imagem, sem width/height, e esse conteúdo permanece como
 *   texto comum, imediatamente após a imagem, exatamente como foi
 *   escrito"). Mecanismo escolhido aqui (Contract §10, LIMITAÇÃO
 *   CONHECIDA / RESPONSABILIDADE FUTURA — "o mecanismo interno no estado
 *   Lexical não é prescrito por este contrato"): como `ImageNode` é
 *   `DecoratorBlockNode` (`isInline() === false`), ela NUNCA pode
 *   conviver como filho do MESMO parágrafo que o `TextNode`
 *   remanescente (bloco não pode ser filho inline de outro bloco). A
 *   `ImageNode` é inserida como bloco IRMÃO, imediatamente ANTES do
 *   parágrafo original — que já contém, intacto, exatamente o texto
 *   remanescente (`children[0]`, nunca modificado, nunca removido) —
 *   nunca descartado, nunca incorporado à imagem. Efeito colateral
 *   honesto e documentado (não escondido): para este caso específico
 *   (extensão ausente-mas-não-vazia ou inválida — nunca para conteúdo
 *   legado, que sempre tem restante vazio), o round-trip de exportação
 *   produz DOIS blocos de nível superior (imagem + parágrafo) onde a
 *   entrada original era uma única linha — estável a partir da segunda
 *   importação. Round-trip byte-idêntico de conteúdo legado (Contract
 *   §2, Ponto 1) é preservado inalterado: aquele caminho nunca tem
 *   restante para preservar.
 *
 * Não existe `ImageNode`/transformer oficial em `@lexical/markdown@0.49.0`
 * (confirmado por busca direta no código-fonte, Editorial Serialization
 * Contract §9) — esta continua sendo a implementação mínima própria
 * exigida pela UXE-010/UXE-022 para essa capacidade.
 */

import type { ElementTransformer } from '@lexical/markdown';
import type { ElementNode, TextNode } from 'lexical';
import {
  IMAGE_BASE_REGEXP,
  parseImageDimensionsExtension,
  serializeImageMarkdown,
  unescapeAltFromMarkdown,
} from '@commerce-platform/editorial';
import { $createImageNode, $isImageNode, ImageNode } from './node';

export const IMAGE: ElementTransformer = {
  dependencies: [ImageNode],

  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    return serializeImageMarkdown(node.getAlt(), node.getSrc(), node.getWidth(), node.getHeight());
  },

  regExp: IMAGE_BASE_REGEXP,

  replace: (parentNode: ElementNode, children, match) => {
    const [, rawAlt, url] = match;
    const imageNode = $createImageNode(url ?? '', unescapeAltFromMarkdown(rawAlt ?? ''));

    const leftoverTextNode = children[0] as TextNode | undefined;
    const leftoverText = leftoverTextNode ? leftoverTextNode.getTextContent() : '';

    if (leftoverText.length === 0) {
      // Sem nenhum restante na linha — comportamento idêntico à UXE-010,
      // nenhuma imagem legada precisa de migração.
      parentNode.replace(imageNode);
      return;
    }

    const dimensions = parseImageDimensionsExtension(leftoverText);
    if (dimensions !== null) {
      // Extensão válida, consumida por inteiro — nada resta a preservar.
      // `height` só existe junto de `width` (invariante da gramática,
      // ver `grammar.ts`) — `setDimensions` (único mutador capaz de
      // gravar `height`) é usado exatamente quando os dois estão
      // presentes; caso contrário, `setWidth` isolado.
      if (dimensions.height !== undefined) {
        imageNode.setDimensions(dimensions.width, dimensions.height);
      } else {
        imageNode.setWidth(dimensions.width);
      }
      parentNode.replace(imageNode);
      return;
    }

    // Extensão ausente-mas-não-vazia ou inválida: a imagem permanece
    // reconhecida, sem `width`/`height`; o texto remanescente (já o
    // único filho de `parentNode`, intacto) permanece como texto comum —
    // ver racional completo no cabeçalho do arquivo.
    parentNode.insertBefore(imageNode);
  },

  type: 'element',
};
