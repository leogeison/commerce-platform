/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-block-editing.spec.tsx
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Cobertura mínima do comportamento de edição de `ImageNode` como bloco
 * atômico (`DecoratorBlockNode`, ver `node.ts`), através de um composer
 * React real (`LexicalComposer`+`RichTextPlugin`, via
 * `@testing-library/react`) — diferente de `image-block.spec.ts`
 * (`createEditor` puro, sem composer): só um composer React real ativa
 * `useDecorators`/`LegacyDecorators` (dentro de `RichTextPlugin`), o
 * mecanismo do qual `decorate()` depende para o `<img>` aparecer de fato
 * no DOM — ver doc comment de `image-block.spec.ts` para o racional
 * completo dessa divisão.
 *
 * Escopo desta suíte (deliberadamente mínimo — não cobre toda a semântica
 * de teclado do Lexical, conforme decisão fechada no desenho): comprova
 * que o bloco existe entre blocos de texto e renderiza de verdade; que é
 * atômico por construção (nenhuma API de filhos Lexical exposta); que
 * seleção/caret continuam funcionando nos blocos antes/depois; e que um
 * cenário representativo de Backspace adjacente ao bloco não lança
 * exceção nem deixa o documento num estado quebrado (permanece
 * exportável e editável em seguida). Não afirma qual é o estado exato de
 * seleção entre teclas — essa mecânica interna já pertence a
 * `@lexical/rich-text` (`registerRichText`, `KEY_BACKSPACE_COMMAND`), não
 * a este node.
 */

import { describe, expect, it } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { $convertToMarkdownString } from '@lexical/markdown';
import { $createImageNode, $isImageNode, ImageNode } from './node';
import { IMAGE } from './transformer';

const TRANSFORMERS = [IMAGE];

const IMAGE_URL = 'https://cdn.exemplo.com/a.jpg';
const IMAGE_ALT = 'Alt da imagem';

/**
 * Expõe a instância real do `LexicalEditor` para fora do componente —
 * mesmo papel que uma prop `editorRef`/`onReady` cumpriria num plugin de
 * produção; aqui existe só para o teste conseguir chamar
 * `editor.update()`/`editor.dispatchCommand()` diretamente, sem simular
 * eventos de teclado nativos do DOM (frágil em jsdom, mesmo critério já
 * documentado em `article-body-slash-menu.tsx` para `getBoundingClientRect`).
 */
function EditorHandlePlugin({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  onReady(editor);
  return null;
}

function renderImageBlockEditor(): LexicalEditor {
  let capturedEditor: LexicalEditor | null = null;

  const initialConfig: InitialConfigType = {
    namespace: 'image-block-editing-spec',
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
    // Estado inicial construído diretamente via API de nodes (não
    // Markdown) — três blocos de nível superior: parágrafo "Antes",
    // ImageNode, parágrafo "Depois". Equivalente ao resultado real de
    // inserir uma imagem entre dois parágrafos existentes.
    editorState: () => {
      const root = $getRoot();
      const before = $createParagraphNode();
      before.append($createTextNode('Antes'));
      const image = $createImageNode(IMAGE_URL, IMAGE_ALT);
      const after = $createParagraphNode();
      after.append($createTextNode('Depois'));
      root.append(before, image, after);
    },
  };

  render(
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable aria-label="Editor de teste" />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <EditorHandlePlugin
        onReady={(editor) => {
          capturedEditor = editor;
        }}
      />
    </LexicalComposer>,
  );

  if (!capturedEditor) {
    throw new Error('Editor de teste não inicializou.');
  }
  return capturedEditor;
}

function exportMarkdown(editor: LexicalEditor): string {
  let output = '';
  editor.getEditorState().read(() => {
    output = $convertToMarkdownString(TRANSFORMERS);
  });
  return output;
}

/**
 * Payload mínimo compatível com o que `registerRichText`
 * (`@lexical/rich-text`) realmente lê de `KEY_BACKSPACE_COMMAND`
 * (`event.target`, `event.preventDefault()`) — confirmado contra o
 * código-fonte real instalado. `target` aponta para a raiz do editor
 * (nunca dentro de um decorator), o mesmo caminho que um Backspace real
 * disparado com o caret num parágrafo de texto percorre.
 */
function fakeBackspaceEvent(target: HTMLElement): KeyboardEvent {
  return { target, preventDefault: () => {} } as unknown as KeyboardEvent;
}

/**
 * Mesmo payload mínimo, mas para `KEY_DELETE_COMMAND` — também só lê
 * `event.target`/`event.preventDefault()` (confirmado contra o mesmo
 * código-fonte). Usado só depois de uma `NodeSelection` real já existir
 * (criada por um clique de verdade, ver teste de regressão abaixo) — o
 * que está em teste ali é se o clique seleciona o node, não se o
 * roteamento nativo de teclado até o elemento focado funciona no jsdom
 * (comportamento de foco/seleção nativa em `contentEditable`,
 * documentadamente não confiável no jsdom nesta base de código — ver
 * `article-body-image-flow.spec.tsx`). Dado que a seleção já existe,
 * `registerRichText` (comportamento genérico pré-existente, não
 * implementado por este node) resolve o resto.
 */
function fakeDeleteEvent(target: HTMLElement): KeyboardEvent {
  return { target, preventDefault: () => {} } as unknown as KeyboardEvent;
}

describe('ImageNode — bloco atômico entre texto (DecoratorBlockNode)', () => {
  it('existe entre os dois parágrafos e renderiza <img> de verdade (portal de decorator via RichTextPlugin)', async () => {
    renderImageBlockEditor();

    const img = await screen.findByAltText(IMAGE_ALT);
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe(IMAGE_URL);
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Depois')).toBeInTheDocument();
  });

  it('não aceita/reconcilia children de texto — nenhuma API de filhos Lexical existe na instância (atomicidade estrutural, não só comportamental)', () => {
    const editor = renderImageBlockEditor();

    editor.getEditorState().read(() => {
      const image = $getRoot().getChildAtIndex(1);
      expect(image).toBeInstanceOf(ImageNode);
      const imageAsRecord = image as unknown as Record<string, unknown>;
      expect(imageAsRecord.append).toBeUndefined();
      expect(imageAsRecord.getChildren).toBeUndefined();
    });
  });

  it('seleção/caret continuam funcionando nos parágrafos antes/depois do bloco', () => {
    const editor = renderImageBlockEditor();

    expect(() => {
      act(() => {
        editor.update(
          () => {
            $getRoot().getChildAtIndex(2)?.selectStart();
          },
          { discrete: true },
        );
      });
    }).not.toThrow();

    editor.getEditorState().read(() => {
      expect($isRangeSelection($getSelection())).toBe(true);
    });

    expect(() => {
      act(() => {
        editor.update(
          () => {
            $getRoot().getChildAtIndex(0)?.selectEnd();
          },
          { discrete: true },
        );
      });
    }).not.toThrow();

    editor.getEditorState().read(() => {
      expect($isRangeSelection($getSelection())).toBe(true);
    });
  });

  it('Backspace a partir do início do parágrafo seguinte não lança exceção nem deixa o documento em estado quebrado — continua exportável e editável', () => {
    const editor = renderImageBlockEditor();

    act(() => {
      editor.update(
        () => {
          $getRoot().getChildAtIndex(2)?.selectStart();
        },
        { discrete: true },
      );
    });

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }

    // Cenário representativo (não exaustivo, por decisão fechada no
    // desenho): o primeiro Backspace nesta posição tipicamente promove o
    // bloco atômico adjacente a uma seleção de nó antes de removê-lo
    // (comportamento real de `@lexical/rich-text` para `DecoratorNode`,
    // não uma suposição desta suíte); um segundo Backspace age sobre o
    // que estiver selecionado. Não afirmamos qual é o estado exato entre
    // as duas teclas — só que nenhuma delas lança e que o documento segue
    // bem formado e editável depois.
    expect(() => {
      act(() => {
        editor.dispatchCommand(KEY_BACKSPACE_COMMAND, fakeBackspaceEvent(rootElement));
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        editor.dispatchCommand(KEY_BACKSPACE_COMMAND, fakeBackspaceEvent(rootElement));
      });
    }).not.toThrow();

    expect(() => exportMarkdown(editor)).not.toThrow();
    expect(typeof exportMarkdown(editor)).toBe('string');

    // A edição continua possível depois do Backspace: inserir texto na
    // seleção atual não lança, e o resultado aparece no export.
    expect(() => {
      act(() => {
        editor.update(
          () => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertText('X');
            }
          },
          { discrete: true },
        );
      });
    }).not.toThrow();

    expect(exportMarkdown(editor)).toContain('X');
  });

  it('clicar na própria imagem seleciona o node (NodeSelection real); Delete remove a imagem do DOM/Markdown; documento continua editável depois (regressão — bug real de validação manual: imagem "presa", impossível de remover)', async () => {
    // Causa raiz confirmada na investigação: `DecoratorBlockNode` sozinho
    // não faz nenhum wiring de clique-para-seleção — precisa de
    // `BlockWithAlignableContents` ou equivalente (ver doc comment de
    // `node.ts`). `getComposedEventTarget(event) === ref.current` do
    // componente pronto do Lexical exige clicar exatamente no wrapper, não
    // no `<img>` filho — por isso este teste clica na própria `<img>`
    // (`screen.findByAltText`), exatamente o alvo que estava quebrado, não
    // num wrapper artificial.
    const user = userEvent.setup();
    const editor = renderImageBlockEditor();

    const img = await screen.findByAltText(IMAGE_ALT);

    // 1. Clique real (evento DOM nativo via userEvent, não
    // `dispatchCommand` sintético) diretamente na imagem. Bubbling de
    // clique/`event.target` é comportamento de DOM básico que o jsdom
    // reproduz fielmente (diferente de foco/seleção nativa em
    // `contentEditable`, que não é confiável aqui) — é exatamente isso
    // que está sob teste: se ESSE clique aciona o `CLICK_COMMAND`
    // registrado por `ImageDecorator` e produz uma `NodeSelection`.
    await user.click(img);

    const imageKey = editor.getEditorState().read(() => {
      const image = $getRoot().getChildAtIndex(1);
      if (!$isImageNode(image)) {
        throw new Error('esperava ImageNode no índice 1 do documento de teste.');
      }
      return image.getKey();
    });

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
      if ($isNodeSelection(selection)) {
        expect(selection.getNodes().map((node) => node.getKey())).toEqual([imageKey]);
      }
    });

    // 2. Delete com o node já selecionado — despachado diretamente (não
    // via `user.keyboard`, ver doc comment de `fakeDeleteEvent` acima)
    // porque o que decide a remoção aqui é a `NodeSelection` do passo 1,
    // não o roteamento de teclado até o elemento focado. Comportamento de
    // remoção em si é genérico de `registerRichText`
    // (`DELETE_CHARACTER_COMMAND` → `selection.deleteNodes()`), não
    // implementado por este node — o que está sob teste é que a seleção
    // do passo 1 realmente ativa esse caminho e realmente remove o node,
    // não apenas "não lança" (diferente do teste de Backspace acima).
    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }
    act(() => {
      editor.dispatchCommand(KEY_DELETE_COMMAND, fakeDeleteEvent(rootElement));
    });

    await waitFor(() => expect(screen.queryByAltText(IMAGE_ALT)).not.toBeInTheDocument());
    editor.getEditorState().read(() => {
      expect($isImageNode($getRoot().getChildAtIndex(1))).toBe(false);
    });
    expect(exportMarkdown(editor)).not.toContain(IMAGE_URL);

    // 3. Documento continua editável depois da remoção — a seleção que
    // sobra depois de `deleteNodes()` é uma seleção real de texto/caret
    // (não a raiz nem um estado quebrado): inserir texto nela não lança e
    // aparece no export.
    expect(() => {
      act(() => {
        editor.update(
          () => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertText('Depois da remoção');
            }
          },
          { discrete: true },
        );
      });
    }).not.toThrow();

    expect(exportMarkdown(editor)).toContain('Depois da remoção');
  });
});
