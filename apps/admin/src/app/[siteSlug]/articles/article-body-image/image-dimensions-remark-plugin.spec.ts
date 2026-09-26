/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-dimensions-remark-plugin.spec.ts
 *
 * UXE-022 — Editorial Serialization Contract §10.
 *
 * Suíte de equivalência obrigatória: reusa `IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`
 * (`@commerce-platform/editorial`, mesmo corpus consumido por
 * `packages/editorial/src/image/grammar.spec.ts` e pelo adapter
 * equivalente do FastCompre) — nunca duplica os casos aqui à mão. Árvores
 * mdast construídas literalmente (não via `evaluate()` real — Jest não
 * executa a árvore ESM real de `@mdx-js/mdx` neste projeto sem
 * `transpilePackages`, mesma limitação já catalogada em
 * `../compile-article-body.ts`/`compile-article-body.spec.ts`) — a
 * fidelidade da estrutura `image` + `text` irmão e do mecanismo
 * `hProperties.style` em si já foi comprovada, fora do Jest, pela fixture
 * isolada citada no relatório desta tarefa, e pelo script permanente
 * `spikes/lexical-editorial/uxe-022-image-dimensions-production-pipeline-proof.mjs`.
 */

import { describe, expect, it } from '@jest/globals';
import { IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS } from '@commerce-platform/editorial';
import { remarkImageDimensions } from './image-dimensions-remark-plugin';

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

describe('remarkImageDimensions — adapter do Preview do Admin', () => {
  describe('equivalência obrigatória (corpus normativo compartilhado, Contract §10)', () => {
    for (const testCase of IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS) {
      it(`${testCase.label}`, () => {
        const paragraph = buildParagraph(testCase.suffix);
        const tree = { type: 'root', children: [paragraph] };

        remarkImageDimensions()(tree);

        const imageNode = paragraph.children[0] as MdastImageNode;

        if (testCase.expectedWidth === null) {
          expect(imageNode.data?.hProperties?.width).toBeUndefined();
          expect(imageNode.data?.hProperties?.height).toBeUndefined();
          if (testCase.suffix.length > 0) {
            // Extensão não consumida: texto remanescente preservado,
            // literal, como filho irmão — nunca descartado.
            expect(paragraph.children).toHaveLength(2);
            expect(paragraph.children[1]).toEqual({ type: 'text', value: testCase.suffix });
          } else {
            expect(paragraph.children).toHaveLength(1);
          }
        } else {
          expect(imageNode.data?.hProperties?.width).toBe(testCase.expectedWidth);
          // Extensão consumida por inteiro — nenhum texto residual.
          expect(paragraph.children).toHaveLength(1);

          if (testCase.expectedHeight === null) {
            // Forma só-largura: comportamento inalterado desde a rodada
            // anterior — sem height, sem style.
            expect(imageNode.data?.hProperties?.height).toBeUndefined();
            expect(imageNode.data?.hProperties?.style).toBeUndefined();
          } else {
            expect(imageNode.data?.hProperties?.height).toBe(testCase.expectedHeight);
            expect(imageNode.data?.hProperties?.style).toBe(
              `aspect-ratio: ${testCase.expectedWidth} / ${testCase.expectedHeight}; width: 100%; max-width: ${testCase.expectedWidth}px; height: auto;`,
            );
          }
        }
      });
    }
  });

  it('não interfere em parágrafo sem nenhuma imagem', () => {
    const paragraph = { type: 'paragraph', children: [{ type: 'text', value: 'Texto comum, sem imagem.' }] };
    const tree = { type: 'root', children: [paragraph] };

    expect(() => remarkImageDimensions()(tree)).not.toThrow();
    expect(paragraph.children).toEqual([{ type: 'text', value: 'Texto comum, sem imagem.' }]);
  });

  it('preserva data.hProperties pré-existente na imagem (mescla, nunca sobrescreve outras props) — forma só-largura', () => {
    const paragraph: MdastParagraphNode = {
      type: 'paragraph',
      children: [
        { type: 'image', url: IMAGE_URL, alt: IMAGE_ALT, data: { hProperties: { loading: 'lazy' } } },
        { type: 'text', value: '{width=600}' },
      ],
    };
    const tree = { type: 'root', children: [paragraph] };

    remarkImageDimensions()(tree);

    const imageNode = paragraph.children[0] as MdastImageNode;
    expect(imageNode.data?.hProperties).toEqual({ loading: 'lazy', width: 600 });
  });

  it('preserva data.hProperties pré-existente na imagem (mescla, nunca sobrescreve outras props) — forma combinada', () => {
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

  it('percorre profundidades diferentes da árvore (ex.: imagem dentro de um blockquote)', () => {
    const paragraph = buildParagraph('{width=600 height=300}');
    const tree = { type: 'root', children: [{ type: 'blockquote', children: [paragraph] }] };

    remarkImageDimensions()(tree);

    const imageNode = paragraph.children[0] as MdastImageNode;
    expect(imageNode.data?.hProperties?.width).toBe(600);
    expect(imageNode.data?.hProperties?.height).toBe(300);
  });

  it('imagem sem nenhum irmão de texto (fim de parágrafo): permanece sem width/height, sem lançar', () => {
    const paragraph = buildParagraph('');
    const tree = { type: 'root', children: [paragraph] };

    expect(() => remarkImageDimensions()(tree)).not.toThrow();
    const imageNode = paragraph.children[0] as MdastImageNode;
    expect(imageNode.data).toBeUndefined();
  });
});
