/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-block.spec.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: extensão
 * de dimensões `{width=N}`/`{width=N height=M}` (Editorial Serialization
 * Contract §10).
 *
 * Round-trip de `ImageNode`/`IMAGE` através de um editor Lexical real
 * (`createEditor`, sem composer React) — mesmo padrão de
 * `../product-block/product-block.spec.ts`: exercita o modelo do node
 * (`getSrc`/`getAlt`/`getWidth`/`getHeight`) e o transformer Markdown
 * (import/export), não a gramática pura (já coberta separadamente em
 * `packages/editorial/src/image/grammar.spec.ts`, incluindo o corpus
 * `IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS` reusado abaixo).
 *
 * `ImageNode` é `DecoratorBlockNode` (ver `node.ts`): este arquivo NÃO
 * afirma o `<img>` renderizado no DOM (`root.querySelectorAll('img')`),
 * porque um `createEditor()` sem nenhum composer React montado nunca
 * invoca `useDecorators`/`LegacyDecorators` — o mecanismo que monta
 * `decorate()` via portal React dentro do DOM. Essa asserção vive em
 * `image-block-editing.spec.tsx` (mesmo diretório), que monta
 * `LexicalComposer`+`RichTextPlugin` de verdade.
 *
 * As linhas de entrada usadas nos testes de round-trip byte-idêntico são
 * sempre construídas via `serializeImageMarkdown` (a mesma função de
 * produção), nunca digitadas manualmente com escaping à mão — digitar a
 * forma escapada à mão é frágil (comprovado durante a implementação
 * original desta suíte).
 */

import { describe, expect, it } from '@jest/globals';
import { $getRoot, $isElementNode, createEditor } from 'lexical';
import type { LexicalNode } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS, serializeImageMarkdown } from '@commerce-platform/editorial';
import { IMAGE } from './transformer';
import { $isImageNode, ImageNode } from './node';

const TRANSFORMERS = [IMAGE];

function importMarkdown(inputMarkdown: string) {
  const editor = createEditor({
    namespace: 'admin-article-body-image-round-trip-spec',
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });

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

function $collectImageNodesRecursive(node: LexicalNode, found: ImageNode[]): void {
  if ($isImageNode(node)) {
    found.push(node);
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectImageNodesRecursive(child, found);
    }
  }
}

function collectImageNodes(
  editor: ReturnType<typeof createEditor>,
): Array<{ src: string; alt: string; width: number | undefined; height: number | undefined }> {
  const found: ImageNode[] = [];
  const result: Array<{ src: string; alt: string; width: number | undefined; height: number | undefined }> = [];
  editor.getEditorState().read(() => {
    $collectImageNodesRecursive($getRoot(), found);
    for (const node of found) {
      result.push({ src: node.getSrc(), alt: node.getAlt(), width: node.getWidth(), height: node.getHeight() });
    }
  });
  return result;
}

function exportMarkdown(editor: ReturnType<typeof createEditor>): string {
  let output = '';
  editor.getEditorState().read(() => {
    output = $convertToMarkdownString(TRANSFORMERS);
  });
  return output;
}

function $collectTopLevelTextRecursive(editor: ReturnType<typeof createEditor>): string[] {
  const texts: string[] = [];
  editor.getEditorState().read(() => {
    for (const child of $getRoot().getChildren()) {
      if (!$isImageNode(child)) {
        texts.push(child.getTextContent());
      }
    }
  });
  return texts;
}

describe('ImageNode / IMAGE — round-trip (modelo + Markdown)', () => {
  it('informativa: round-trip byte-idêntico e node com alt preenchido, incluindo pontuação Markdown relevante', () => {
    const alt = 'Oferta *especial* [2026]';
    const url = 'https://cdn.exemplo.com/a.jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('decorativa: alt="" preservado como escolha deliberada, nunca omitido/inferido', () => {
    const url = 'https://cdn.exemplo.com/b.png';
    const input = serializeImageMarkdown('', url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt: '', width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('round-trip com underscore/backtick no alt (produto_v2 / npm install)', () => {
    const alt = 'produto_v2 `npm install`';
    const url = 'https://cdn.exemplo.com/c.jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('round-trip com alt contendo barra invertida literal e dois-pontos (caminho de arquivo)', () => {
    const alt = 'C:\\imagens\\foto';
    const url = 'https://cdn.exemplo.com/d.webp';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('URL contendo parênteses sobrevive ao round-trip através do editor real (delimitador <...>, não depende de a URL nunca ter "(" ou ")")', () => {
    const alt = 'Alt qualquer';
    const url = 'https://cdn.exemplo.com/(destaque)/foto(1).jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('cercada por Markdown comum: importa exatamente 1 imagem, sem duplicar/perder texto ao redor', () => {
    const input = `Texto antes.\n\n${serializeImageMarkdown('', 'https://cdn.exemplo.com/e.jpg')}\n\nTexto depois.`;
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toHaveLength(1);
    const output = exportMarkdown(editor);
    expect(output).toContain('Texto antes.');
    expect(output).toContain('Texto depois.');
    expect(output).toContain(serializeImageMarkdown('', 'https://cdn.exemplo.com/e.jpg'));
  });

  it('linha que não segue a gramática (sem <...>) permanece texto comum, não vira ImageNode', () => {
    const input = '![alt](https://cdn.exemplo.com/sem-angle-brackets.jpg)';
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toHaveLength(0);
  });

  describe('UXE-022 — extensão de dimensões: equivalência obrigatória (corpus normativo compartilhado, Contract §10)', () => {
    for (const testCase of IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS) {
      it(`${testCase.label}`, () => {
        const alt = 'Produto em destaque';
        const url = 'https://cdn.exemplo.com/f.jpg';
        const input = `${serializeImageMarkdown(alt, url)}${testCase.suffix}`;
        const editor = importMarkdown(input);

        const images = collectImageNodes(editor);
        expect(images).toHaveLength(1);
        expect(images[0]).toMatchObject({ src: url, alt });
        expect(images[0].width).toBe(testCase.expectedWidth ?? undefined);
        expect(images[0].height).toBe(testCase.expectedHeight ?? undefined);

        if (testCase.expectedWidth === null && testCase.suffix.length > 0) {
          // Extensão ausente-mas-não-vazia ou inválida: o restante da
          // linha permanece preservado, literal, num bloco de texto
          // separado (ver racional completo em `transformer.ts`) —
          // nunca descartado, nunca incorporado à imagem.
          expect($collectTopLevelTextRecursive(editor).join('\n')).toContain(testCase.suffix);
        }
      });
    }
  });

  it('largura válida (sem altura): round-trip byte-idêntico (serializeImageMarkdown com width → export idêntico)', () => {
    const alt = 'Produto';
    const url = 'https://cdn.exemplo.com/g.jpg';
    const width = 600;
    const input = serializeImageMarkdown(alt, url, width);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width, height: undefined }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('largura e altura válidas: round-trip byte-idêntico (serializeImageMarkdown com width+height → export idêntico)', () => {
    const alt = 'Banner de campanha';
    const url = 'https://cdn.exemplo.com/i.jpg';
    const width = 800;
    const height = 450;
    const input = serializeImageMarkdown(alt, url, width, height);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width, height }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('largura ausente: export nunca inclui "{width=" — comportamento idêntico ao legado da UXE-010', () => {
    const input = serializeImageMarkdown('Produto', 'https://cdn.exemplo.com/h.jpg');
    const editor = importMarkdown(input);

    expect(exportMarkdown(editor)).not.toContain('{width=');
  });

  it('altura nunca é exportada sem largura — invariante estrutural do node (setDimensions é o único mutador capaz de gravar height)', () => {
    const alt = 'Produto';
    const url = 'https://cdn.exemplo.com/j.jpg';
    const width = 500;
    const height = 400;
    const input = serializeImageMarkdown(alt, url, width, height);
    const editor = importMarkdown(input);

    editor.update(
      () => {
        const found: ImageNode[] = [];
        $collectImageNodesRecursive($getRoot(), found);
        found[0]?.setWidth(undefined);
      },
      { discrete: true },
    );

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt, width: undefined, height: undefined }]);
    expect(exportMarkdown(editor)).not.toContain('{width=');
    expect(exportMarkdown(editor)).not.toContain('{height=');
  });
});
