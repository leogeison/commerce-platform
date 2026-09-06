/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/transformer.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * `IMAGE` — `ElementTransformer` (não `multiline-element`, diferente de
 * `PRODUCT_BLOCK`: a sintaxe de imagem é sempre uma única linha, sem
 * abertura/fechamento). `regExp` casa a linha inteira
 * (`IMAGE_LINE_REGEXP`, âncorada com `^...$`) — não sobra nenhum texto
 * para ser processado como filhos inline, então `children` (recebido por
 * `replace`) é sempre ignorado por construção.
 *
 * Não existe `ImageNode`/transformer oficial em `@lexical/markdown@0.49.0`
 * (confirmado por busca direta no código-fonte, Editorial Serialization
 * Contract §9) — esta é a implementação mínima própria exigida pela
 * UXE-010 para essa capacidade.
 */

import type { ElementTransformer } from '@lexical/markdown';
import type { ElementNode } from 'lexical';
import { $createImageNode, $isImageNode, ImageNode } from './node';
import { IMAGE_LINE_REGEXP, serializeImageMarkdown, unescapeAltFromMarkdown } from './grammar';

export const IMAGE: ElementTransformer = {
  dependencies: [ImageNode],

  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    return serializeImageMarkdown(node.getAlt(), node.getSrc());
  },

  regExp: IMAGE_LINE_REGEXP,

  replace: (parentNode: ElementNode, _children, match) => {
    const [, rawAlt, url] = match;
    const imageNode = $createImageNode(url ?? '', unescapeAltFromMarkdown(rawAlt ?? ''));
    parentNode.replace(imageNode);
  },

  type: 'element',
};
