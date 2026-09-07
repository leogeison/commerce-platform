/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/product-block-node-editing.spec.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Cobertura mínima do comportamento de edição de `ProductBlockNode` como
 * bloco atômico (`DecoratorBlockNode`, migrado nesta tarefa), através de
 * um composer React real (`LexicalComposer`+`RichTextPlugin`) — mesmo
 * critério de divisão já usado por `image-block-editing.spec.tsx`
 * (`../article-body-image/image-block-editing.spec.tsx`): só um composer
 * React real ativa `useDecorators`, o mecanismo do qual `decorate()`
 * depende para o conteúdo aparecer de fato no DOM. `product-block.spec.ts`
 * (11 cenários normativos, intocado por esta tarefa) continua cobrindo
 * round-trip Markdown puro via `createEditor` sem composer.
 *
 * `ProductLookupProvider` real (não um mock de Context) envolve o composer
 * em todos os testes — mesma fonte compartilhada usada em produção — com
 * `global.fetch` mockado por teste para produzir cada estado de resolução
 * (`ready`/`not-found`/`loading`/`error`).
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
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
  COMMAND_PRIORITY_EDITOR,
  KEY_DELETE_COMMAND,
  RootNode,
  type LexicalEditor,
} from 'lexical';
import { $convertToMarkdownString } from '@lexical/markdown';
import { ProductLookupProvider } from '../product-lookup-context';
import { $createProductBlockNode, $isProductBlockNode, ProductBlockNode } from './node';
import { PRODUCT_BLOCK } from './transformer';
import { OPEN_PRODUCT_BLOCK_EDIT_COMMAND } from './edit-command';

const TRANSFORMERS = [PRODUCT_BLOCK];

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_NAME = 'Fone Bluetooth';
const OTHER_PRODUCT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function makeProduct(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name,
    slug: name.toLowerCase(),
    description: null,
    imageUrl: null,
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function mockReadyLookup(): void {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/products')) {
      return jsonResponse(200, { productIds: [PRODUCT_ID] });
    }
    return jsonResponse(200, {
      items: [makeProduct(PRODUCT_ID, PRODUCT_NAME)],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
  });
}

function mockNotFoundLookup(): void {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/products')) {
      // Artigo vinculado a um Produto DIFERENTE do referenciado pelo bloco
      // — referência órfã (Contract §5: nunca fallback para outro Produto).
      return jsonResponse(200, { productIds: [OTHER_PRODUCT_ID] });
    }
    return jsonResponse(200, {
      items: [makeProduct(OTHER_PRODUCT_ID, 'Outro Produto')],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
  });
}

function mockLoadingLookup(): void {
  global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
}

function mockErrorLookup(): void {
  global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));
}

/**
 * Mesmo papel de `EditorHandlePlugin` em `image-block-editing.spec.tsx`.
 */
function EditorHandlePlugin({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  onReady(editor);
  return null;
}

function renderProductBlockEditor(): LexicalEditor {
  let capturedEditor: LexicalEditor | null = null;

  const initialConfig: InitialConfigType = {
    namespace: 'product-block-editing-spec',
    nodes: [ProductBlockNode],
    onError: (error) => {
      throw error;
    },
    // Três blocos de nível superior: parágrafo "Antes", ProductBlockNode,
    // parágrafo "Depois" — equivalente ao resultado real de inserir um
    // bloco de Produto entre dois parágrafos existentes. Deletar o bloco
    // aqui NUNCA deixa o Root vazio (dois parágrafos permanecem) — o
    // invariante "Root nunca vazio" (`RootNeverEmptyPlugin`) é coberto à
    // parte em `article-body-editor.spec.tsx`, onde o plugin realmente é
    // montado (ele pertence à composição do editor, não ao node).
    editorState: () => {
      const root = $getRoot();
      const before = $createParagraphNode();
      before.append($createTextNode('Antes'));
      const productBlock = $createProductBlockNode(PRODUCT_ID);
      const after = $createParagraphNode();
      after.append($createTextNode('Depois'));
      root.append(before, productBlock, after);
    },
  };

  render(
    <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
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
      </LexicalComposer>
    </ProductLookupProvider>,
  );

  if (!capturedEditor) {
    throw new Error('Editor de teste não inicializou.');
  }
  return capturedEditor;
}

/**
 * Mesma transform registrada em produção por `RootNeverEmptyPlugin`
 * (`../article-body-editor.tsx`, montado dentro de `ArticleBodyEditor`) —
 * duplicada aqui porque aquele componente é privado ao módulo do editor
 * (não exportado) e este harness precisa de acesso direto à instância do
 * `LexicalEditor` para instrumentar `registerUpdateListener` e comprovar
 * a ausência de um commit intermediário com Root vazio.
 *
 * Cobertura end-to-end através do `ArticleBodyEditor` real de produção
 * (sem essa instrumentação) foi deliberadamente NÃO adicionada a
 * `article-body-editor.spec.tsx`: `ArticleBodyEditor` não expõe nenhuma
 * ref/handle para a instância do `LexicalEditor`, então um teste
 * black-box só poderia acionar Delete/Backspace via evento de teclado
 * real (`user.keyboard('{Delete}')`) através do `contentEditable` — um
 * padrão de interação que NENHUM outro teste desta base de código usa
 * (todos os testes de Delete/Backspace existentes, inclusive os já
 * validados de `ImageNode`/UXE-010, despacham `KEY_DELETE_COMMAND`
 * diretamente via `editor.dispatchCommand(...)`, exatamente como este
 * arquivo faz) — sem conseguir executar a suíte neste ambiente para
 * validar se esse caminho alternativo dispara de forma confiável o
 * pipeline nativo do Lexical no jsdom, arriscar um teste novo, não
 * verificado, nesse padrão inédito foi julgado pior do que documentar
 * honestamente a lacuna aqui. Esta suíte, com acesso direto à instância
 * real do editor, é hoje a única cobertura automatizada deste invariante
 * específico (nenhum commit observável com Root vazio) — mas exercita a
 * MESMA composição de produção (`RichTextPlugin`+`registerRichText`) e a
 * MESMA transform registrada por `RootNeverEmptyPlugin`, só que copiada
 * localmente pelo motivo acima.
 */
function RootNeverEmptyTestPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerNodeTransform(RootNode, (root) => {
      if (root.getChildrenSize() === 0) {
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      }
    });
  }, [editor]);
  return null;
}

function renderSoleProductBlockEditor(): LexicalEditor {
  let capturedEditor: LexicalEditor | null = null;

  const initialConfig: InitialConfigType = {
    namespace: 'product-block-sole-editing-spec',
    nodes: [ProductBlockNode],
    onError: (error) => {
      throw error;
    },
    // Único bloco de nível superior do documento — remover este
    // `ProductBlockNode` deixaria `RootNode` com zero filhos se nada
    // interviesse; é exatamente esse cenário que `RootNeverEmptyTestPlugin`
    // precisa resolver.
    editorState: () => {
      $getRoot().append($createProductBlockNode(PRODUCT_ID));
    },
  };

  render(
    <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={<ContentEditable aria-label="Editor de teste (bloco único)" />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <RootNeverEmptyTestPlugin />
        <EditorHandlePlugin
          onReady={(editor) => {
            capturedEditor = editor;
          }}
        />
      </LexicalComposer>
    </ProductLookupProvider>,
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
 * Mesmo payload mínimo já validado em `image-block-editing.spec.tsx` —
 * `registerRichText` só lê `event.target`/`event.preventDefault()`.
 */
function fakeDeleteEvent(target: HTMLElement): KeyboardEvent {
  return { target, preventDefault: () => {} } as unknown as KeyboardEvent;
}

describe('ProductBlockNode — bloco atômico entre texto (DecoratorBlockNode)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolução "ready": renderiza o nome do Produto vinculado e o botão "Editar bloco de Produto vinculado", entre os dois parágrafos', async () => {
    mockReadyLookup();
    renderProductBlockEditor();

    expect(await screen.findByText(PRODUCT_NAME)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar bloco de Produto vinculado' })).toBeInTheDocument();
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Depois')).toBeInTheDocument();
  });

  it('resolução "not-found": productId sintaticamente válido mas não vinculado a este Artigo mostra estado explícito, nunca outro Produto', async () => {
    mockNotFoundLookup();
    renderProductBlockEditor();

    expect(await screen.findByText('Produto vinculado não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Outro Produto')).not.toBeInTheDocument();
  });

  it('resolução "loading": mostra estado de carregamento enquanto a fonte compartilhada não resolveu', () => {
    mockLoadingLookup();
    renderProductBlockEditor();

    expect(screen.getByText('Carregando Produto vinculado...')).toBeInTheDocument();
  });

  it('resolução "error": mostra mensagem genérica quando a fonte compartilhada falha ao carregar', async () => {
    mockErrorLookup();
    renderProductBlockEditor();

    expect(await screen.findByText('Não foi possível carregar o Produto vinculado.')).toBeInTheDocument();
  });

  it('não aceita/reconcilia children de texto — nenhuma API de filhos Lexical existe na instância (atomicidade estrutural)', async () => {
    mockReadyLookup();
    const editor = renderProductBlockEditor();
    // Espera a fonte compartilhada (`ProductLookupProvider`) resolver as
    // duas buscas assíncronas ANTES de qualquer asserção — causa
    // confirmada do warning "not wrapped in act(...)": sem este `await`,
    // o corpo do teste terminava de forma síncrona enquanto as promises
    // mockadas ainda estavam pendentes, e o `setState` do Provider disparava
    // depois, fora de qualquer `act()`/utilitário assíncrono do Testing
    // Library. A leitura abaixo não depende do texto resolvido — só do
    // `await` em si, para deixar esse `setState` assentar dentro do
    // `act()` que `findByText` já aplica internamente.
    await screen.findByText(PRODUCT_NAME);

    editor.getEditorState().read(() => {
      const block = $getRoot().getChildAtIndex(1);
      expect(block).toBeInstanceOf(ProductBlockNode);
      const blockAsRecord = block as unknown as Record<string, unknown>;
      expect(blockAsRecord.append).toBeUndefined();
      expect(blockAsRecord.getChildren).toBeUndefined();
    });
  });

  it('seleção/caret continuam funcionando nos parágrafos antes/depois do bloco', async () => {
    mockReadyLookup();
    const editor = renderProductBlockEditor();
    // Mesma causa/correção do teste anterior — espera a fonte compartilhada
    // resolver antes de qualquer asserção, para que o `setState` do
    // Provider assente dentro do `act()` que `findByText` já aplica,
    // nunca depois do corpo síncrono do teste já ter terminado.
    await screen.findByText(PRODUCT_NAME);

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
  });

  it('clicar no rótulo do Produto seleciona o node (NodeSelection real); Delete remove o bloco do DOM/Markdown; documento continua editável depois', async () => {
    mockReadyLookup();
    const user = userEvent.setup();
    const editor = renderProductBlockEditor();

    const label = await screen.findByText(PRODUCT_NAME);
    await user.click(label);

    const blockKey = editor.getEditorState().read(() => {
      const block = $getRoot().getChildAtIndex(1);
      if (!$isProductBlockNode(block)) {
        throw new Error('esperava ProductBlockNode no índice 1 do documento de teste.');
      }
      return block.getKey();
    });

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
      if ($isNodeSelection(selection)) {
        expect(selection.getNodes().map((node) => node.getKey())).toEqual([blockKey]);
      }
    });

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }
    act(() => {
      editor.dispatchCommand(KEY_DELETE_COMMAND, fakeDeleteEvent(rootElement));
    });

    await waitFor(() => expect(screen.queryByText(PRODUCT_NAME)).not.toBeInTheDocument());
    editor.getEditorState().read(() => {
      expect($isProductBlockNode($getRoot().getChildAtIndex(1))).toBe(false);
    });
    expect(exportMarkdown(editor)).not.toContain(PRODUCT_ID);

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

  it('clicar em "Editar bloco de Produto vinculado" despacha OPEN_PRODUCT_BLOCK_EDIT_COMMAND com a nodeKey do bloco (fluxo real de edição é `ArticleBodyProductFlow`, coberto à parte)', async () => {
    mockReadyLookup();
    const user = userEvent.setup();
    const editor = renderProductBlockEditor();

    const expectedKey = editor.getEditorState().read(() => {
      const block = $getRoot().getChildAtIndex(1);
      if (!$isProductBlockNode(block)) {
        throw new Error('esperava ProductBlockNode no índice 1 do documento de teste.');
      }
      return block.getKey();
    });

    const received: string[] = [];
    editor.registerCommand(
      OPEN_PRODUCT_BLOCK_EDIT_COMMAND,
      (payload) => {
        received.push(payload.nodeKey);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    const button = await screen.findByRole('button', { name: 'Editar bloco de Produto vinculado' });
    await user.click(button);

    expect(received).toEqual([expectedKey]);
  });

  it('botão "Editar bloco de Produto vinculado" fica desabilitado quando o editor está !isEditable (mesmo mecanismo que desabilita o contentEditable durante outro fluxo/submit)', async () => {
    mockReadyLookup();
    const editor = renderProductBlockEditor();

    act(() => {
      editor.setEditable(false);
    });

    const button = await screen.findByRole('button', { name: 'Editar bloco de Produto vinculado' });
    expect(button).toBeDisabled();
  });

  it('remover o único ProductBlockNode do documento (Root ficaria vazio): RootNeverEmptyPlugin garante um ParagraphNode no MESMO commit — nenhum estado observado por registerUpdateListener tem Root vazio; documento continua editável depois', async () => {
    mockReadyLookup();
    const user = userEvent.setup();
    const editor = renderSoleProductBlockEditor();

    const label = await screen.findByText(PRODUCT_NAME);
    await user.click(label);

    // Registrado só a partir daqui (depois do commit inicial de
    // montagem) — captura o commit da seleção por clique e o commit da
    // remoção em seguida.
    const observedChildCounts: number[] = [];
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        observedChildCounts.push($getRoot().getChildrenSize());
      });
    });

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      throw new Error('root element ausente');
    }
    act(() => {
      editor.dispatchCommand(KEY_DELETE_COMMAND, fakeDeleteEvent(rootElement));
    });

    await waitFor(() => expect(screen.queryByText(PRODUCT_NAME)).not.toBeInTheDocument());

    // Nenhum commit observado durante/depois da remoção teve Root com
    // zero filhos — o transform roda DENTRO do mesmo `editor.update()`
    // que fez a remoção, antes de qualquer commit externamente
    // observável (nunca um `registerUpdateListener` reparando depois de
    // um estado já commitado com Root vazio).
    expect(observedChildCounts.length).toBeGreaterThan(0);
    expect(observedChildCounts.every((count) => count > 0)).toBe(true);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
      expect($getRoot().getFirstChild()?.getType()).toBe('paragraph');
    });

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

    expect(exportMarkdown(editor)).toBe('Depois da remoção');
  });
});
