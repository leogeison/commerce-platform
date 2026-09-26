/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/image-block-editing.spec.tsx
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: resize de
 * imagem por borda/canto (Editorial Serialization Contract §10) — 8
 * zonas invisíveis de pointer/touch (`./resize-zones.tsx`) + 2 sliders
 * de teclado independentes (`./resize-sliders.tsx`, "Largura da
 * imagem"/"Altura da imagem"), foco.
 *
 * Cobertura mínima do comportamento de edição de `ImageNode` como bloco
 * atômico (`DecoratorBlockNode`, ver `node.ts`), através de um composer
 * React real (`LexicalComposer`+`RichTextPlugin`, via
 * `@testing-library/react`) — diferente de `image-block.spec.ts`
 * (`createEditor` puro, sem composer): só um composer React real ativa
 * `useDecorators`/`LegacyDecorators` (dentro de `RichTextPlugin`), o
 * mecanismo do qual `decorate()` depende para o `<img>`/zonas/sliders de
 * resize aparecerem de fato no DOM.
 *
 * LIMITAÇÃO DE AMBIENTE conhecida e documentada (não afeta a suíte de
 * cima, `image-block.spec.ts`, que não depende de nenhuma delas):
 * - `naturalWidth`/`naturalHeight` reais de um `<img>` nunca são
 *   computados pelo jsdom (sem decodificação real de imagem) — os testes
 *   que dependem deles stubam as duas propriedades com
 *   `Object.defineProperty` antes de disparar `fireEvent.load(img)`,
 *   prática padrão para este cenário.
 * - jsdom 26.1.0 (versão instalada, confirmado no `node_modules` real)
 *   NÃO implementa `PointerEvent`/`setPointerCapture` nativamente — por
 *   isso `resize-zones.tsx` (produção) já trata `setPointerCapture`/
 *   `releasePointerCapture` como opcionais (`typeof ... === 'function'`
 *   + `try/catch`), e os testes de arraste abaixo usam
 *   `fireEvent.pointerDown/pointerMove/pointerUp` (suporte de
 *   compatibilidade do próprio `@testing-library/dom` para ambientes sem
 *   `window.PointerEvent` nativo).
 * - `getBoundingClientRect()` de qualquer elemento no jsdom sempre
 *   devolve um retângulo zerado (sem layout real) — `resize-zones.tsx`
 *   (produção) mede a largura/altura REALMENTE renderizada da própria
 *   `<img>` nesse método no início de cada gesto (ver `node.ts`/
 *   `resize-zones.tsx`), então os testes de arraste abaixo stubam
 *   `img.getBoundingClientRect` com um retângulo conhecido antes de
 *   disparar `pointerdown` — mesmo racional já estabelecido para
 *   `naturalWidth`/`naturalHeight`.
 * - Ordem real de tabulação (`Tab` percorrendo slider de Largura → de
 *   Altura) não é simulada via `userEvent.tab()` aqui — `userEvent.tab()`
 *   não é garantidamente confiável no jsdom para elementos focáveis por
 *   `tabIndex` fora de um formulário nativo, atravessando a fronteira de
 *   um decorator `contentEditable=false`. Em vez disso, os testes abaixo
 *   verificam a garantia estrutural que sustenta essa ordem: os dois
 *   sliders existem na árvore DOM, o de Largura aparece ANTES do de
 *   Altura (mesma ordem que `Tab` percorreria por padrão), e os dois são
 *   igualmente focáveis (`tabIndex=0`) — ver `resize-sliders.tsx` para o
 *   racional completo da ordem.
 */

import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const WIDTH_SLIDER_NAME = 'Largura da imagem';
const HEIGHT_SLIDER_NAME = 'Altura da imagem';

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

function renderImageBlockEditor(initialWidth?: number, initialHeight?: number): LexicalEditor {
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
      const image = $createImageNode(IMAGE_URL, IMAGE_ALT, initialWidth, initialHeight);
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
 * roteamento nativo de teclado até o elemento focado funciona no jsdom.
 */
function fakeDeleteEvent(target: HTMLElement): KeyboardEvent {
  return { target, preventDefault: () => {} } as unknown as KeyboardEvent;
}

/**
 * Estabelece `naturalWidth`/`naturalHeight` num `<img>` já renderizado e
 * dispara `load` — as duas são somente-leitura em navegadores reais e
 * nunca computadas pelo jsdom (sem decodificação real de imagem), então
 * o único jeito de exercitar o caminho "imagem carregada" nestes testes
 * é redefinir as propriedades antes do evento, prática padrão para este
 * cenário em suítes que testam `<img onLoad>`.
 */
function stubNaturalDimensionsAndFireLoad(img: HTMLImageElement, naturalWidth: number, naturalHeight: number): void {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true });
  act(() => {
    fireEvent.load(img);
  });
}

/**
 * Stub de `getBoundingClientRect()` — jsdom sempre devolve um retângulo
 * zerado (sem layout real); `resize-zones.tsx` (produção) mede a
 * largura/altura REALMENTE renderizada da própria `<img>` nesse método
 * no início de cada gesto de arraste, então os testes precisam de um
 * valor conhecido para poder afirmar o resultado do gesto.
 */
function stubRenderedRect(img: HTMLImageElement, width: number, height: number): void {
  img.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

async function selectImage(): Promise<HTMLImageElement> {
  const user = userEvent.setup();
  const img = await screen.findByAltText<HTMLImageElement>(IMAGE_ALT);
  await user.click(img);
  return img;
}

function getWidthSlider(): HTMLElement {
  return screen.getByRole('slider', { name: WIDTH_SLIDER_NAME });
}

function getHeightSlider(): HTMLElement {
  return screen.getByRole('slider', { name: HEIGHT_SLIDER_NAME });
}

function getResizeZone(key: string): HTMLElement {
  const zone = document.querySelector<HTMLElement>(`[data-resize-zone="${key}"]`);
  if (!zone) {
    throw new Error(`zona de resize "${key}" não encontrada no DOM.`);
  }
  return zone;
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
    const user = userEvent.setup();
    const editor = renderImageBlockEditor();

    const img = await screen.findByAltText(IMAGE_ALT);

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

describe('ImageNode — resize por borda/canto (UXE-022, Contract §10): zonas de pointer/touch, sliders de teclado, foco', () => {
  it('controles ausentes antes de a imagem carregar, mesmo selecionada (naturalWidth/naturalHeight ainda desconhecidos)', async () => {
    renderImageBlockEditor();
    await selectImage();

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(document.querySelector('[data-resize-zone]')).not.toBeInTheDocument();
  });

  it('controles ausentes quando naturalWidth < MIN_IMAGE_WIDTH (100), mesmo com naturalHeight válido — decisão fechada no desenho, evita aria-valuemax < aria-valuemin', async () => {
    renderImageBlockEditor();
    const img = await selectImage();

    stubNaturalDimensionsAndFireLoad(img, 80, 800);

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('controles ausentes quando naturalHeight < MIN_IMAGE_HEIGHT (100), mesmo com naturalWidth válido — mesma decisão, aplicada ao eixo altura', async () => {
    renderImageBlockEditor();
    const img = await selectImage();

    stubNaturalDimensionsAndFireLoad(img, 800, 80);

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('controles aparecem quando a imagem selecionada termina de carregar com naturalWidth E naturalHeight >= 100 — 8 zonas + 2 sliders', async () => {
    renderImageBlockEditor();
    const img = await selectImage();

    stubNaturalDimensionsAndFireLoad(img, 800, 600);

    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    for (const key of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      expect(getResizeZone(key)).toBeInTheDocument();
    }
  });

  it('controles desaparecem quando a imagem é desselecionada (clicar em outro lugar do editor)', async () => {
    const user = userEvent.setup();
    renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 800, 600);
    expect(await screen.findAllByRole('slider')).toHaveLength(2);

    await user.click(screen.getByText('Antes'));

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(document.querySelector('[data-resize-zone]')).not.toBeInTheDocument();
  });

  it('ordem no DOM: slider de Largura aparece antes do de Altura, os dois igualmente focáveis (sustenta a ordem de Tab — ver racional no cabeçalho do arquivo)', async () => {
    renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 800, 600);
    await screen.findAllByRole('slider');

    const widthSlider = getWidthSlider();
    const heightSlider = getHeightSlider();
    expect(widthSlider.compareDocumentPosition(heightSlider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(widthSlider).toHaveAttribute('tabIndex', '0');
    expect(heightSlider).toHaveAttribute('tabIndex', '0');
  });

  it('atributos ARIA dos dois sliders: role="slider", aria-valuemin/max/now coerentes por eixo, nunca max < min', async () => {
    renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 500, 300);

    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });
    expect(widthSlider).toHaveAttribute('aria-valuemin', '100');
    expect(widthSlider).toHaveAttribute('aria-valuemax', '500'); // naturalWidth (500) < MAX_IMAGE_WIDTH (1200), nunca upscale além dele
    expect(widthSlider).toHaveAttribute('aria-orientation', 'horizontal');

    const heightSlider = getHeightSlider();
    expect(heightSlider).toHaveAttribute('aria-valuemin', '100');
    expect(heightSlider).toHaveAttribute('aria-valuemax', '300');
    expect(heightSlider).toHaveAttribute('aria-orientation', 'vertical');

    for (const slider of [widthSlider, heightSlider]) {
      expect(Number(slider.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(Number(slider.getAttribute('aria-valuemin')));
      expect(slider).toHaveAccessibleName();
    }
  });

  it('sem width/height persistidos: aria-valuenow de cada slider parte do respectivo natural* (clampado ao máximo normativo) — comportamento legado (max-width:100%) preservado', async () => {
    renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 2000, 1500);

    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });
    expect(widthSlider).toHaveAttribute('aria-valuemax', '1200');
    expect(widthSlider).toHaveAttribute('aria-valuenow', '1200');

    const heightSlider = getHeightSlider();
    expect(heightSlider).toHaveAttribute('aria-valuemax', '1200');
    expect(heightSlider).toHaveAttribute('aria-valuenow', '1200');
  });

  it('ArrowLeft/ArrowRight com o slider de Largura focado ajustam só a largura (altura pinada no valor efetivo atual) em passos de 10px', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 2000, 2000);
    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });

    act(() => {
      widthSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(widthSlider, { key: 'ArrowRight' });
    });
    await waitFor(() => expect(widthSlider).toHaveAttribute('aria-valuenow', '610'));

    act(() => {
      fireEvent.keyDown(widthSlider, { key: 'ArrowLeft' });
    });
    await waitFor(() => expect(widthSlider).toHaveAttribute('aria-valuenow', '600'));

    editor.getEditorState().read(() => {
      const image = $getRoot().getChildAtIndex(1);
      expect($isImageNode(image) && image.getWidth()).toBe(600);
      expect($isImageNode(image) && image.getHeight()).toBe(300);
    });
  });

  it('ArrowUp/ArrowDown com o slider de Altura focado ajustam só a altura (largura pinada) em passos de 10px — Cima aumenta, Baixo diminui', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 2000, 2000);
    const heightSlider = await screen.findByRole('slider', { name: HEIGHT_SLIDER_NAME });

    act(() => {
      heightSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(heightSlider, { key: 'ArrowUp' });
    });
    await waitFor(() => expect(heightSlider).toHaveAttribute('aria-valuenow', '310'));

    act(() => {
      fireEvent.keyDown(heightSlider, { key: 'ArrowDown' });
    });
    await waitFor(() => expect(heightSlider).toHaveAttribute('aria-valuenow', '300'));

    editor.getEditorState().read(() => {
      const image = $getRoot().getChildAtIndex(1);
      expect($isImageNode(image) && image.getWidth()).toBe(600);
      expect($isImageNode(image) && image.getHeight()).toBe(300);
    });
  });

  it('Shift+ArrowRight/Shift+ArrowUp ajustam largura/altura em passos de 50px', async () => {
    renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 2000, 2000);

    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });
    act(() => {
      widthSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(widthSlider, { key: 'ArrowRight', shiftKey: true });
    });
    await waitFor(() => expect(widthSlider).toHaveAttribute('aria-valuenow', '650'));

    const heightSlider = getHeightSlider();
    act(() => {
      heightSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(heightSlider, { key: 'ArrowUp', shiftKey: true });
    });
    await waitFor(() => expect(heightSlider).toHaveAttribute('aria-valuenow', '350'));
  });

  it('ajuste de teclado nunca ultrapassa MIN_IMAGE_WIDTH/MIN_IMAGE_HEIGHT nem natural* — clampImageWidth/clampImageHeight aplicados na interação', async () => {
    renderImageBlockEditor(105, 110);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 300, 300);

    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });
    act(() => {
      widthSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(widthSlider, { key: 'ArrowLeft', shiftKey: true }); // -50, resultaria em 55
    });
    await waitFor(() => expect(widthSlider).toHaveAttribute('aria-valuenow', '100'));

    const heightSlider = getHeightSlider();
    act(() => {
      heightSlider.focus();
    });
    act(() => {
      fireEvent.keyDown(heightSlider, { key: 'ArrowDown', shiftKey: true }); // -50, resultaria em 60
    });
    await waitFor(() => expect(heightSlider).toHaveAttribute('aria-valuenow', '100'));
  });

  it('navegação normal do Lexical (ArrowLeft/ArrowRight fora dos sliders) permanece intocada — não dispara ajuste de dimensões', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 2000, 2000);
    await screen.findAllByRole('slider');

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }
    act(() => {
      fireEvent.keyDown(rootElement, { key: 'ArrowRight' });
    });

    editor.getEditorState().read(() => {
      const image = $getRoot().getChildAtIndex(1);
      expect($isImageNode(image) && image.getWidth()).toBe(600);
      expect($isImageNode(image) && image.getHeight()).toBe(300);
    });
  });

  it('arraste na zona LESTE (borda vertical) altera só a largura — altura persistida no valor efetivo atual ("pinada")', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 900, 900);
    stubRenderedRect(img, 600, 300);
    await screen.findAllByRole('slider');
    const zoneE = getResizeZone('e');

    act(() => {
      fireEvent.pointerDown(zoneE, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerMove(zoneE, { pointerId: 1, clientX: 40, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerUp(zoneE, { pointerId: 1, clientX: 40, clientY: 0 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(640);
        expect($isImageNode(image) && image.getHeight()).toBe(300);
      });
    });
  });

  it('arraste na zona OESTE (borda vertical) altera só a largura, sentido invertido (arrastar para a esquerda aumenta)', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 900, 900);
    stubRenderedRect(img, 600, 300);
    await screen.findAllByRole('slider');
    const zoneW = getResizeZone('w');

    act(() => {
      fireEvent.pointerDown(zoneW, { pointerId: 1, clientX: 100, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerMove(zoneW, { pointerId: 1, clientX: 60, clientY: 0 }); // dx=-40, signX=-1 → +40
    });
    act(() => {
      fireEvent.pointerUp(zoneW, { pointerId: 1, clientX: 60, clientY: 0 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(640);
        expect($isImageNode(image) && image.getHeight()).toBe(300);
      });
    });
  });

  it('arraste na zona NORTE (borda horizontal) altera só a altura, sentido invertido (arrastar para cima aumenta) — largura persistida "pinada"', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 900, 900);
    stubRenderedRect(img, 600, 300);
    await screen.findAllByRole('slider');
    const zoneN = getResizeZone('n');

    act(() => {
      fireEvent.pointerDown(zoneN, { pointerId: 1, clientX: 0, clientY: 100 });
    });
    act(() => {
      fireEvent.pointerMove(zoneN, { pointerId: 1, clientX: 0, clientY: 60 }); // dy=-40, signY=-1 → +40
    });
    act(() => {
      fireEvent.pointerUp(zoneN, { pointerId: 1, clientX: 0, clientY: 60 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(600);
        expect($isImageNode(image) && image.getHeight()).toBe(340);
      });
    });
  });

  it('arraste na zona SUDESTE (canto) altera largura E altura livremente/não-proporcionalmente', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 900, 900);
    stubRenderedRect(img, 600, 300);
    await screen.findAllByRole('slider');
    const zoneSE = getResizeZone('se');

    act(() => {
      fireEvent.pointerDown(zoneSE, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerMove(zoneSE, { pointerId: 1, clientX: 40, clientY: 20 });
    });
    act(() => {
      fireEvent.pointerUp(zoneSE, { pointerId: 1, clientX: 40, clientY: 20 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(640);
        expect($isImageNode(image) && image.getHeight()).toBe(320);
      });
    });
  });

  it('arraste captura a largura/altura REALMENTE RENDERIZADA no início do gesto — nunca o width/height ainda não persistido', async () => {
    // Sem width/height persistidos ainda (undefined) — a única forma de
    // saber o ponto de partida do gesto é medir o retângulo renderizado
    // real (ver racional em `resize-zones.tsx`).
    const editor = renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 900, 900);
    stubRenderedRect(img, 500, 400);
    await screen.findAllByRole('slider');
    const zoneE = getResizeZone('e');

    act(() => {
      fireEvent.pointerDown(zoneE, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerMove(zoneE, { pointerId: 1, clientX: 20, clientY: 0 });
    });
    act(() => {
      fireEvent.pointerUp(zoneE, { pointerId: 1, clientX: 20, clientY: 0 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(520);
        // height nunca existia antes — o gesto na zona LESTE persiste os
        // DOIS eixos a partir do renderizado real (400), nunca deixa
        // height órfão.
        expect($isImageNode(image) && image.getHeight()).toBe(400);
      });
    });
  });

  it('arraste nunca faz upscale além de naturalWidth/naturalHeight quando conhecidos', async () => {
    const editor = renderImageBlockEditor(600, 300);
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 650, 320);
    stubRenderedRect(img, 600, 300);
    await screen.findAllByRole('slider');
    const zoneSE = getResizeZone('se');

    act(() => {
      fireEvent.pointerDown(zoneSE, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    act(() => {
      // Tentaria width=1100 (muito além de naturalWidth=650) e
      // height=800 (muito além de naturalHeight=320).
      fireEvent.pointerMove(zoneSE, { pointerId: 1, clientX: 500, clientY: 500 });
    });
    act(() => {
      fireEvent.pointerUp(zoneSE, { pointerId: 1, clientX: 500, clientY: 500 });
    });

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const image = $getRoot().getChildAtIndex(1);
        expect($isImageNode(image) && image.getWidth()).toBe(650);
        expect($isImageNode(image) && image.getHeight()).toBe(320);
      });
    });
  });

  it('Enter com a ImageNode selecionada move o foco para o slider de Largura primeiro', async () => {
    const editor = renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 800, 600);
    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });

    expect(document.activeElement).not.toBe(widthSlider);

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }
    act(() => {
      fireEvent.keyDown(rootElement, { key: 'Enter' });
    });

    await waitFor(() => expect(document.activeElement).toBe(widthSlider));
  });

  it('Escape no slider de Largura devolve o foco ao editor, mantendo a imagem selecionada (NodeSelection intocada)', async () => {
    const editor = renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 800, 600);
    const widthSlider = await screen.findByRole('slider', { name: WIDTH_SLIDER_NAME });

    act(() => {
      widthSlider.focus();
    });
    expect(document.activeElement).toBe(widthSlider);

    act(() => {
      fireEvent.keyDown(widthSlider, { key: 'Escape' });
    });

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
    });
  });

  it('Escape no slider de Altura devolve o foco ao editor, mantendo a imagem selecionada (mesmo comportamento do slider de Largura)', async () => {
    const editor = renderImageBlockEditor();
    const img = await selectImage();
    stubNaturalDimensionsAndFireLoad(img, 800, 600);
    const heightSlider = await screen.findByRole('slider', { name: HEIGHT_SLIDER_NAME });

    act(() => {
      heightSlider.focus();
    });
    expect(document.activeElement).toBe(heightSlider);

    act(() => {
      fireEvent.keyDown(heightSlider, { key: 'Escape' });
    });

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
    });
  });
});
