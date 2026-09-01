/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/transformer.ts
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * `PRODUCT_BLOCK` — porte para TypeScript do `MultilineElementTransformer`
 * original de `spikes/lexical-editorial/product-block-transformer.mjs`
 * (UXE-003/UXE-004). Nenhuma regra de aceitação/rejeição foi alterada —
 * só a sintaxe (JS → TS com tipos do `@lexical/markdown@0.49.0` real).
 */

import type { MultilineElementTransformer } from '@lexical/markdown';
import type { ElementNode } from 'lexical';
import { $createProductBlockNode, $isProductBlockNode, ProductBlockNode } from './node';
import {
  CLOSER_REGEXP,
  OPENER_REGEXP,
  ProductBlockSyntaxError,
  parseProductBlockBody,
  serializeProductBlock,
} from './grammar';

export const PRODUCT_BLOCK: MultilineElementTransformer = {
  dependencies: [ProductBlockNode],

  export: (node) => {
    if (!$isProductBlockNode(node)) {
      return null;
    }
    return serializeProductBlock(node.getProductId());
  },

  regExpStart: OPENER_REGEXP,

  // `optional: true` — mesmo racional do spike: faz `$importMultiline`
  // invocar `replace` mesmo ao atingir o fim do documento sem encontrar o
  // closer, com `endMatch` ausente (`null`) nesse caso. Sem isso, um bloco
  // sem fechamento cairia no fallback padrão do Lexical (linha do opener
  // reprocessada como Markdown comum) — exatamente o que o comportamento
  // fail-closed do Contract (§3) proíbe.
  regExpEnd: {
    optional: true,
    regExp: CLOSER_REGEXP,
  },

  replace: (rootNode: ElementNode, _children, _startMatch, endMatch, linesInBetween) => {
    if (!endMatch) {
      throw new ProductBlockSyntaxError('bloco sem fechamento (":::" ausente antes do fim do documento).');
    }

    // `linesInBetween` inclui sempre uma entrada de borda no início e no
    // fim (o restante da linha do opener/closer depois do respectivo
    // match — sempre "" nesta gramática). Essas duas entradas não são
    // conteúdo do corpo do bloco.
    const rawLines = linesInBetween ?? [];
    const bodyLines = rawLines.slice(1, -1);

    const { productId } = parseProductBlockBody(bodyLines);

    rootNode.append($createProductBlockNode(productId));

    return true;
  },

  type: 'multiline-element',
};
