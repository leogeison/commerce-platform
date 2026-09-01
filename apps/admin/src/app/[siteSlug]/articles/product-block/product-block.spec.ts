/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/product-block.spec.ts
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * Reprodução dos 11 cenários normativos de
 * `spikes/lexical-editorial/product-block-round-trip.mjs` (UXE-003) contra
 * a cópia local (`./grammar`, `./node`, `./transformer`) — comprova a
 * aderência exigida pelo Editorial Serialization Contract §8 mesmo sem
 * `packages/editorial-syntax` compartilhado ("qualquer implementação de
 * produção... comprovadamente equivalente... verificada pela mesma suíte
 * normativa de testes").
 *
 * Diferença deliberada em relação ao spike: em vez de `createHeadlessEditor`
 * (`@lexical/headless`, dependência que não faz parte do desenho aprovado
 * de produção desta tarefa), usa-se `createEditor` (núcleo `lexical`, já
 * uma dependência aprovada) com uma raiz DOM real (jsdom) — o que também
 * exercita `ProductBlockNode.createDOM`/`updateDOM` (novos nesta tarefa),
 * algo que o spike, rodando headless, nunca fez.
 */

import { describe, expect, it } from '@jest/globals';
import { $getRoot, $isElementNode, createEditor } from 'lexical';
import type { LexicalNode } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { PRODUCT_BLOCK } from './transformer';
import { $isProductBlockNode, ProductBlockNode, ProductBlockSyntaxError } from './node';

const TRANSFORMERS = [PRODUCT_BLOCK];

// Mesmas chaves proibidas do spike (UXE-003) — nenhuma pode aparecer sob a
// chave `$` (namespace de NodeState) do JSON serializado do node.
const FORBIDDEN_STATE_KEYS = ['name', 'price', 'link', 'offerId', 'markdownSyntaxVersion', 'version'];

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function importMarkdown(inputMarkdown: string) {
  const editor = createEditor({
    namespace: 'admin-product-block-round-trip-spec',
    nodes: [ProductBlockNode],
    onError: (error) => {
      throw error;
    },
  });

  // Raiz DOM real (jsdom) — diferente do spike headless, exercita
  // createDOM/updateDOM do ProductBlockNode.
  const rootElement = document.createElement('div');
  document.body.appendChild(rootElement);
  editor.setRootElement(rootElement);

  editor.update(
    () => {
      $convertFromMarkdownString(inputMarkdown, TRANSFORMERS);
    },
    { discrete: true },
  );

  return editor;
}

function $collectProductBlockNodesRecursive(node: LexicalNode, found: unknown[]): void {
  if ($isProductBlockNode(node)) {
    found.push(node.exportJSON());
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectProductBlockNodesRecursive(child, found);
    }
  }
}

function collectProductBlockNodes(editor: ReturnType<typeof createEditor>) {
  const found: unknown[] = [];
  editor.getEditorState().read(() => {
    $collectProductBlockNodesRecursive($getRoot(), found);
  });
  return found;
}

function exportMarkdown(editor: ReturnType<typeof createEditor>): string {
  let output = '';
  editor.getEditorState().read(() => {
    output = $convertToMarkdownString(TRANSFORMERS);
  });
  return output;
}

describe('ProductBlockNode / PRODUCT_BLOCK — 11 cenários normativos (paridade com o spike UXE-003)', () => {
  it('bloco-valido-isolado: round-trip byte-idêntico; estado editorial contém somente productId', () => {
    const input = `:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`;
    const editor = importMarkdown(input);
    const nodes = collectProductBlockNodes(editor) as Array<{ $?: Record<string, unknown> }>;

    expect(nodes).toHaveLength(1);
    expect(Object.keys(nodes[0].$ ?? {})).toEqual(['productId']);
    for (const forbiddenKey of FORBIDDEN_STATE_KEYS) {
      expect(nodes[0].$ ?? {}).not.toHaveProperty(forbiddenKey);
    }
    expect((nodes[0].$ as Record<string, unknown>).productId).toBe(VALID_UUID);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('bloco-valido-cercado-por-markdown-comum: importa exatamente 1 bloco, sem duplicar/perder texto ao redor', () => {
    const input = `Texto antes do bloco.\n\n:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::\n\nTexto depois do bloco.`;
    const editor = importMarkdown(input);
    const nodes = collectProductBlockNodes(editor) as Array<{ $?: Record<string, unknown> }>;

    expect(nodes).toHaveLength(1);
    expect((nodes[0].$ as Record<string, unknown>).productId).toBe(VALID_UUID);
    const output = exportMarkdown(editor);
    expect(output).toContain('Texto antes do bloco.');
    expect(output).toContain('Texto depois do bloco.');
    expect(output).toContain(':::product');
  });

  it('opener-indentado-continua-markdown-comum (controle): opener indentado NUNCA é reconhecido como sintaxe customizada', () => {
    const input = `  :::product\n  version: 1\n  productId: ${VALID_UUID}\n  :::`;
    const editor = importMarkdown(input);
    const nodes = collectProductBlockNodes(editor);

    expect(nodes).toHaveLength(0);
  });

  it('version-ausente: fail-closed determinístico (ProductBlockSyntaxError), nunca fallback silencioso', () => {
    const input = `:::product\nproductId: ${VALID_UUID}\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('version-desconhecida: fail-closed determinístico', () => {
    const input = `:::product\nversion: 2\nproductId: ${VALID_UUID}\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('productId-ausente: fail-closed determinístico', () => {
    const input = `:::product\nversion: 1\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('productId-uuid-invalido: fail-closed determinístico', () => {
    const input = `:::product\nversion: 1\nproductId: nao-e-um-uuid\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('campo-linha-extra: fail-closed determinístico (corpo com mais de 2 linhas)', () => {
    const input = `:::product\nversion: 1\nproductId: ${VALID_UUID}\nname: Produto X\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('campo-duplicado: fail-closed determinístico (productId duplicado)', () => {
    const input = `:::product\nversion: 1\nproductId: ${VALID_UUID}\nproductId: ${VALID_UUID}\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('ordem-invalida: fail-closed determinístico (productId antes de version)', () => {
    const input = `:::product\nproductId: ${VALID_UUID}\nversion: 1\n:::`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });

  it('bloco-sem-fechamento: fail-closed determinístico, nunca reprocessado como Markdown comum', () => {
    const input = `:::product\nversion: 1\nproductId: ${VALID_UUID}`;
    expect(() => importMarkdown(input)).toThrow(ProductBlockSyntaxError);
  });
});
