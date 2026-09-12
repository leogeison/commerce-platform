/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-remark-plugin.spec.ts
 *
 * UXE-017 — Plugin/transform do pipeline MDX do FastCompre.
 *
 * Escopo deliberado desta suíte (evita duplicar a suíte normativa
 * completa da gramática, já garantida por
 * `packages/editorial/src/product-block/grammar.spec.ts` e regredida por
 * `apps/admin/.../product-block/product-block.spec.ts`):
 *
 * 1. Transformação AST — o plugin reescreve corretamente um parágrafo
 *    candidato em `mdxJsxFlowElement` com exatamente 1 atributo
 *    (`productId`), e o faz tanto para um bloco isolado quanto para um
 *    bloco cercado por outros nós de documento.
 * 2. Propagação representativa de erro — o plugin deixa
 *    `ProductBlockSyntaxError` (de `@commerce-platform/editorial`)
 *    propagar sem capturá-la, para 2 desvios representativos (bloco sem
 *    fechamento; um desvio de corpo, `productId` com UUID inválido) — não
 *    as 8 variações negativas completas, já cobertas na suíte normativa.
 * 3. Não-interferência — um parágrafo comum (inclusive um que começa com
 *    texto parecido, mas não bate o opener exato) atravessa o plugin sem
 *    nenhuma alteração.
 *
 * `jest.doMock('unist-util-visit', ...)` — mesma disciplina já
 * estabelecida em `compile-article-body.spec.ts` para `@mdx-js/mdx`:
 * `unist-util-visit` é um pacote ESM puro (`export {...} from`), e
 * `next/jest` não transforma pacotes de `node_modules` por padrão — a
 * mesma classe de falha ("Unexpected token 'export'") já catalogada na
 * UXE-015. Diferente do mock trivial de `compile-article-body.spec.ts`
 * (onde `visit()` nunca é chamado, porque `evaluate()` em si já está
 * mockado), aqui o mock precisa ser FUNCIONAL: os testes abaixo chamam a
 * função real exportada pelo plugin de produção
 * (`remarkProductBlock()`), que invoca `visit()` de verdade contra as
 * árvores mdast literais construídas nos testes — por isso o mock
 * reimplementa a semântica mínima que este plugin depende (percorrer a
 * árvore em pré-ordem, chamar o visitor para cada node cujo `type` bate,
 * com `(node, index, parent)`), não um stub vazio. Esta reimplementação é
 * só um duplo de teste (nunca roda em produção — o bundle real do Next.js
 * resolve o `unist-util-visit` real via ESM nativo); a fidelidade do
 * pipeline real com a biblioteca real é comprovada à parte, fora do Jest,
 * por `spikes/lexical-editorial/uxe-017-production-pipeline-proof.mjs`.
 *
 * Por isso mesmo, este arquivo segue a mesma disciplina de
 * `jest.doMock()` + `import()` dinâmico já usada em
 * `compile-article-body.spec.ts`/`page.spec.tsx` — `jest.doMock` não é
 * hoisted como `jest.mock`, então precisa vir antes do `import()` que
 * carrega o módulo do plugin.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';

interface MdastNode {
  type: string;
  children?: unknown[];
}

/**
 * Reimplementação mínima e fiel do subconjunto de `visit(tree, type,
 * visitor)` que `remarkProductBlock` realmente usa: travessia em
 * pré-ordem, profundidade primeiro, chamando `visitor(node, index,
 * parent)` para cada node cujo `type` bate — suficiente para o único uso
 * do plugin de produção (substituição no mesmo índice, nunca
 * remoção/reordenação, então não precisa da lógica de ajuste de índice da
 * biblioteca real para remoções).
 */
function visit(tree: unknown, type: string, visitor: (node: unknown, index: number | undefined, parent: unknown) => void) {
  function walk(node: unknown, index: number | undefined, parent: unknown) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if ((node as MdastNode).type === type) {
      visitor(node, index, parent);
    }
    const children = (node as MdastNode).children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        walk(children[i], i, node);
      }
    }
  }
  walk(tree, undefined, undefined);
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

interface MdastJsxFlowElement {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: Array<{ type: string; name: string; value: string }>;
  children: unknown[];
}

function paragraphNode(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] };
}

describe('remarkProductBlock', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function loadPlugin() {
    jest.doMock('unist-util-visit', () => ({ visit }));
    const { PRODUCT_BLOCK_JSX_COMPONENT_NAME, remarkProductBlock } = await import('./product-block-remark-plugin');
    const { ProductBlockSyntaxError } = await import('@commerce-platform/editorial');
    return { PRODUCT_BLOCK_JSX_COMPONENT_NAME, remarkProductBlock, ProductBlockSyntaxError };
  }

  function runPlugin(remarkProductBlock: () => (tree: unknown) => void, tree: { type: 'root'; children: unknown[] }) {
    remarkProductBlock()(tree);
    return tree;
  }

  describe('transformação AST', () => {
    it('bloco-valido-isolado: reescreve o parágrafo em mdxJsxFlowElement com exatamente 1 atributo (productId)', async () => {
      const { PRODUCT_BLOCK_JSX_COMPONENT_NAME, remarkProductBlock } = await loadPlugin();
      const tree = { type: 'root' as const, children: [paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`)] };

      runPlugin(remarkProductBlock, tree);

      expect(tree.children).toHaveLength(1);
      const element = tree.children[0] as MdastJsxFlowElement;
      expect(element.type).toBe('mdxJsxFlowElement');
      expect(element.name).toBe(PRODUCT_BLOCK_JSX_COMPONENT_NAME);
      expect(element.attributes).toHaveLength(1);
      expect(element.attributes[0]).toEqual({ type: 'mdxJsxAttribute', name: 'productId', value: VALID_UUID });
      expect(element.children).toEqual([]);
    });

    it('bloco-valido-cercado-por-outros-nos: só o parágrafo do bloco é reescrito, os nós ao redor permanecem intocados', async () => {
      const { remarkProductBlock } = await loadPlugin();
      const before = { type: 'paragraph', children: [{ type: 'text', value: 'Texto antes do bloco.' }] };
      const after = { type: 'paragraph', children: [{ type: 'text', value: 'Texto depois do bloco.' }] };
      const tree = {
        type: 'root' as const,
        children: [before, paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`), after],
      };

      runPlugin(remarkProductBlock, tree);

      expect(tree.children).toHaveLength(3);
      expect(tree.children[0]).toBe(before);
      expect(tree.children[2]).toBe(after);
      const element = tree.children[1] as MdastJsxFlowElement;
      expect(element.type).toBe('mdxJsxFlowElement');
      expect(element.attributes).toEqual([{ type: 'mdxJsxAttribute', name: 'productId', value: VALID_UUID }]);
    });
  });

  describe('propagação representativa de erro (fail-closed)', () => {
    it('bloco-sem-fechamento: propaga ProductBlockSyntaxError sem capturá-la', async () => {
      const { remarkProductBlock, ProductBlockSyntaxError } = await loadPlugin();
      const tree = { type: 'root' as const, children: [paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}`)] };

      expect(() => runPlugin(remarkProductBlock, tree)).toThrow(ProductBlockSyntaxError);
    });

    it('productId-uuid-invalido: propaga ProductBlockSyntaxError sem capturá-la (desvio de corpo, não de fronteira)', async () => {
      const { remarkProductBlock, ProductBlockSyntaxError } = await loadPlugin();
      const tree = { type: 'root' as const, children: [paragraphNode(':::product\nversion: 1\nproductId: nao-e-um-uuid\n:::')] };

      expect(() => runPlugin(remarkProductBlock, tree)).toThrow(ProductBlockSyntaxError);
    });
  });

  describe('não-interferência com Markdown comum', () => {
    it('parágrafo comum permanece intocado', async () => {
      const { remarkProductBlock } = await loadPlugin();
      const original = paragraphNode('Um parágrafo qualquer, sem relação com o bloco de Produto.');
      const tree = { type: 'root' as const, children: [original] };

      runPlugin(remarkProductBlock, tree);

      expect(tree.children).toEqual([original]);
    });

    it('opener indentado (texto começa com espaço) continua Markdown comum, sem erro', async () => {
      const { remarkProductBlock } = await loadPlugin();
      // Mesmo texto de um opener válido, mas com espaço antes — a garantia
      // testada é a do próprio OPENER_REGEXP (já normativa em
      // `@commerce-platform/editorial`): uma linha indentada nunca casa com
      // o opener exato.
      const original = paragraphNode(`  :::product\n  version: 1\n  productId: ${VALID_UUID}\n  :::`);
      const tree = { type: 'root' as const, children: [original] };

      expect(() => runPlugin(remarkProductBlock, tree)).not.toThrow();
      expect(tree.children).toEqual([original]);
    });

    it('parágrafo com múltiplos filhos (ex.: texto com ênfase) nunca é candidato, mesmo citando ":::product" no texto', async () => {
      const { remarkProductBlock } = await loadPlugin();
      const original = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Veja o bloco ' },
          { type: 'strong', children: [{ type: 'text', value: ':::product' }] },
          { type: 'text', value: ' abaixo.' },
        ],
      };
      const tree = { type: 'root' as const, children: [original] };

      expect(() => runPlugin(remarkProductBlock, tree)).not.toThrow();
      expect(tree.children).toEqual([original]);
    });
  });
});
