/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/image-dimensions-remark-plugin.spec.ts
 *
 * UXE-022 — Editorial Serialization Contract §10.
 *
 * `jest.doMock('unist-util-visit', ...)` — mesma disciplina já
 * estabelecida em `product-block-remark-plugin.spec.ts` (ver o racional
 * completo lá): `unist-util-visit` é um pacote ESM puro e `next/jest` não
 * transforma pacotes de `node_modules` por padrão. A reimplementação
 * mínima de `visit(tree, type, visitor)` abaixo é idêntica à usada
 * naquele arquivo (mesmo subconjunto suficiente: travessia em pré-ordem,
 * profundidade primeiro, `visitor(node, index, parent)`) — nunca roda em
 * produção, só neste duplo de teste.
 *
 * Suíte de equivalência obrigatória: reusa `IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`
 * (`@commerce-platform/editorial`, mesmo corpus consumido por
 * `packages/editorial/src/image/grammar.spec.ts` e pelo adapter
 * equivalente do Admin) — nunca duplica os casos aqui à mão.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';

interface MdastNode {
  type: string;
  children?: unknown[];
}

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

interface MdastImageNode {
  type: 'image';
  url: string;
  alt: string;
  data?: { hProperties?: Record<string, unknown> };
}

interface MdastTextNode {
  type: 'text';
  value: string;
}

interface MdastParagraphNode {
  type: 'paragraph';
  children: Array<MdastImageNode | MdastTextNode>;
}

const IMAGE_URL = 'https://cdn.exemplo.com/a.jpg';
const IMAGE_ALT = 'Alt da imagem';

function buildParagraph(suffix: string): MdastParagraphNode {
  const children: Array<MdastImageNode | MdastTextNode> = [{ type: 'image', url: IMAGE_URL, alt: IMAGE_ALT }];
  if (suffix.length > 0) {
    children.push({ type: 'text', value: suffix });
  }
  return { type: 'paragraph', children };
}

describe('remarkImageDimensions — adapter do FastCompre (pipeline público)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function loadPlugin() {
    jest.doMock('unist-util-visit', () => ({ visit }));
    const { remarkImageDimensions } = await import('./image-dimensions-remark-plugin');
    const { IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS } = await import('@commerce-platform/editorial');
    return { remarkImageDimensions, IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS };
  }

  it('equivalência obrigatória: cada caso do corpus normativo compartilhado é reproduzido exatamente (Contract §10)', async () => {
    const { remarkImageDimensions, IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS } = await loadPlugin();

    for (const testCase of IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS) {
      const paragraph = buildParagraph(testCase.suffix);
      const tree = { type: 'root', children: [paragraph] };

      remarkImageDimensions()(tree);

      const imageNode = paragraph.children[0] as MdastImageNode;

      if (testCase.expectedWidth === null) {
        expect(imageNode.data?.hProperties?.width).toBeUndefined();
        expect(imageNode.data?.hProperties?.height).toBeUndefined();
        if (testCase.suffix.length > 0) {
          expect(paragraph.children).toHaveLength(2);
          expect(paragraph.children[1]).toEqual({ type: 'text', value: testCase.suffix });
        } else {
          expect(paragraph.children).toHaveLength(1);
        }
      } else {
        expect(imageNode.data?.hProperties?.width).toBe(testCase.expectedWidth);
        expect(paragraph.children).toHaveLength(1);

        if (testCase.expectedHeight === null) {
          expect(imageNode.data?.hProperties?.height).toBeUndefined();
          expect(imageNode.data?.hProperties?.style).toBeUndefined();
        } else {
          expect(imageNode.data?.hProperties?.height).toBe(testCase.expectedHeight);
          expect(imageNode.data?.hProperties?.style).toBe(
            `aspect-ratio: ${testCase.expectedWidth} / ${testCase.expectedHeight}; width: 100%; max-width: ${testCase.expectedWidth}px; height: auto;`,
          );
        }
      }
    }
  });

  it('não interfere em parágrafo sem nenhuma imagem', async () => {
    const { remarkImageDimensions } = await loadPlugin();
    const paragraph = { type: 'paragraph', children: [{ type: 'text', value: 'Texto comum, sem imagem.' }] };
    const tree = { type: 'root', children: [paragraph] };

    expect(() => remarkImageDimensions()(tree)).not.toThrow();
    expect(paragraph.children).toEqual([{ type: 'text', value: 'Texto comum, sem imagem.' }]);
  });

  it('preserva data.hProperties pré-existente na imagem (mescla, nunca sobrescreve outras props) — forma combinada', async () => {
    const { remarkImageDimensions } = await loadPlugin();
    const paragraph: MdastParagraphNode = {
      type: 'paragraph',
      children: [
        { type: 'image', url: IMAGE_URL, alt: IMAGE_ALT, data: { hProperties: { loading: 'lazy' } } },
        { type: 'text', value: '{width=600 height=300}' },
      ],
    };
    const tree = { type: 'root', children: [paragraph] };

    remarkImageDimensions()(tree);

    const imageNode = paragraph.children[0] as MdastImageNode;
    expect(imageNode.data?.hProperties).toEqual({
      loading: 'lazy',
      width: 600,
      height: 300,
      style: 'aspect-ratio: 600 / 300; width: 100%; max-width: 600px; height: auto;',
    });
  });

  it('percorre profundidades diferentes da árvore (ex.: imagem dentro de um item de lista)', async () => {
    const { remarkImageDimensions } = await loadPlugin();
    const paragraph = buildParagraph('{width=600 height=300}');
    const tree = { type: 'root', children: [{ type: 'listItem', children: [paragraph] }] };

    remarkImageDimensions()(tree);

    const imageNode = paragraph.children[0] as MdastImageNode;
    expect(imageNode.data?.hProperties?.width).toBe(600);
    expect(imageNode.data?.hProperties?.height).toBe(300);
  });
});
