/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-block.spec.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Round-trip de `ImageNode`/`IMAGE` através de um editor Lexical real
 * (`createEditor`, sem composer React) — mesmo padrão de
 * `../product-block/product-block.spec.ts` (UXE-006): exercita o modelo
 * do node (`getSrc`/`getAlt`) e o transformer Markdown (import/export),
 * não a gramática pura (já coberta separadamente em `grammar.spec.ts`).
 *
 * Diferença desta rodada (`ImageNode` agora é `DecoratorBlockNode`, ver
 * `node.ts`): este arquivo NÃO afirma mais o `<img>` renderizado no DOM
 * (`root.querySelectorAll('img')`), porque um `createEditor()` sem
 * nenhum composer React montado (`LexicalComposer`/`RichTextPlugin`)
 * nunca invoca `useDecorators`/`LegacyDecorators` — o mecanismo que lê
 * `editor.getDecorators()` e monta `decorate()` via portal React dentro
 * do DOM. Sem um composer React real, `decorate()` até é chamado e seu
 * resultado fica registrado em `editor._decorators`, mas nada o insere
 * de fato no DOM — a `<div>` de `createDOM()` fica vazia. Isso é
 * inerente à arquitetura de `DecoratorNode`, não uma lacuna deste
 * arquivo: a asserção do `<img>` real agora vive em
 * `image-block-editing.spec.tsx` (mesmo diretório), que monta
 * `LexicalComposer`+`RichTextPlugin` de verdade via
 * `@testing-library/react`.
 *
 * As linhas de entrada usadas nos testes de round-trip byte-idêntico são
 * sempre construídas via `serializeImageMarkdown` (a mesma função de
 * produção), nunca digitadas manualmente com escaping à mão — digitar a
 * forma escapada à mão é frágil (comprovado durante a implementação desta
 * tarefa: um alt com pontuação parcialmente escapada à mão parece válido
 * mas não é a forma canônica que o próprio exportador produziria,
 * quebrando silenciosamente a asserção de round-trip byte-idêntico).
 */

import { describe, expect, it } from '@jest/globals';
import { $getRoot, $isElementNode, createEditor } from 'lexical';
import type { LexicalNode } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { IMAGE } from './transformer';
import { $isImageNode, ImageNode } from './node';
import { serializeImageMarkdown } from './grammar';

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

function collectImageNodes(editor: ReturnType<typeof createEditor>): Array<{ src: string; alt: string }> {
  const found: ImageNode[] = [];
  const result: Array<{ src: string; alt: string }> = [];
  editor.getEditorState().read(() => {
    $collectImageNodesRecursive($getRoot(), found);
    for (const node of found) {
      result.push({ src: node.getSrc(), alt: node.getAlt() });
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

describe('ImageNode / IMAGE — round-trip (modelo + Markdown)', () => {
  it('informativa: round-trip byte-idêntico e node com alt preenchido, incluindo pontuação Markdown relevante', () => {
    const alt = 'Oferta *especial* [2026]';
    const url = 'https://cdn.exemplo.com/a.jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('decorativa: alt="" preservado como escolha deliberada, nunca omitido/inferido', () => {
    const url = 'https://cdn.exemplo.com/b.png';
    const input = serializeImageMarkdown('', url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt: '' }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('round-trip com underscore/backtick no alt (produto_v2 / npm install)', () => {
    const alt = 'produto_v2 `npm install`';
    const url = 'https://cdn.exemplo.com/c.jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('round-trip com alt contendo barra invertida literal e dois-pontos (caminho de arquivo)', () => {
    const alt = 'C:\\imagens\\foto';
    const url = 'https://cdn.exemplo.com/d.webp';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt }]);
    expect(exportMarkdown(editor)).toBe(input);
  });

  it('URL contendo parênteses sobrevive ao round-trip através do editor real (delimitador <...>, não depende de a URL nunca ter "(" ou ")")', () => {
    const alt = 'Alt qualquer';
    const url = 'https://cdn.exemplo.com/(destaque)/foto(1).jpg';
    const input = serializeImageMarkdown(alt, url);
    const editor = importMarkdown(input);

    expect(collectImageNodes(editor)).toEqual([{ src: url, alt }]);
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
});
