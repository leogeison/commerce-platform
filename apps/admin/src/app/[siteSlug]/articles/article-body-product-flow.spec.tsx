/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-product-flow.spec.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Testa `ArticleBodyProductFlow` sempre através de `ArticleBodyEditor`
 * completo, envolto por `ProductLookupProvider` real (mesmo racional já
 * usado por `article-body-image-flow.spec.tsx` para `ArticleBodyImageFlow`
 * — cobre o fluxo real de ponta a ponta, incluindo o menu `/` como
 * caminho de entrada). `global.fetch` mockado para as duas buscas do
 * Provider (`ArticleProduct`/catálogo) — nenhuma mutação de vínculo
 * acontece neste fluxo (fora de escopo da UXE-011).
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from 'lexical';
import { ArticleBodyEditor } from './article-body-editor';
import { ProductLookupProvider } from './product-lookup-context';

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_NAME = 'Fone Bluetooth';
const OTHER_PRODUCT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const OTHER_PRODUCT_NAME = 'Caixa de Som';

function makeProduct(id: string, name: string) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name,
    slug: name.toLowerCase(),
    description: null,
    imageUrl: null,
    archivedAt: null,
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

function mockProductLookupFetch(productIds: string[], catalog: ReturnType<typeof makeProduct>[]): void {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/products')) {
      return jsonResponse(200, { productIds });
    }
    return jsonResponse(200, { items: catalog, page: 1, pageSize: 100, total: catalog.length, totalPages: 1 });
  });
}

function mockProductLookupLoading(): void {
  global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
}

function mockProductLookupError(): void {
  global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));
}

async function renderEditor(props: Partial<React.ComponentProps<typeof ArticleBodyEditor>> = {}) {
  const onChange = props.onChange ?? jest.fn();
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <ProductLookupProvider siteSlug={props.siteSlug ?? SITE_SLUG} articleId={ARTICLE_ID}>
        <label id="article-body-label" htmlFor="article-body">
          Corpo (Markdown)
        </label>
        <ArticleBodyEditor
          id="article-body"
          labelId="article-body-label"
          siteSlug={props.siteSlug ?? SITE_SLUG}
          initialValue={props.initialValue ?? ''}
          onChange={onChange}
          disabled={props.disabled}
        />
      </ProductLookupProvider>,
    );
  });
  return { ...utils, onChange };
}

// Mesma técnica de `article-body-image-flow.spec.tsx`/
// `article-body-slash-menu.spec.tsx` — `user.type()` num `contentEditable`
// estruturalmente vazio não é confiável no jsdom; API pública do Lexical
// usada diretamente em vez disso.
function insertTextIntoEmptyLexicalEditor(editorRoot: HTMLElement, text: string): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('insertTextIntoEmptyLexicalEditor: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      $getRoot().selectStart();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      }
    },
    { discrete: true },
  );
}

function insertTextAtCurrentSelection(editorRoot: HTMLElement, text: string): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('insertTextAtCurrentSelection: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      }
    },
    { discrete: true },
  );
}

async function openInsertDialogViaSlashMenu(editor: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  act(() => {
    insertTextIntoEmptyLexicalEditor(editor, '/produto');
  });
  const options = await screen.findAllByRole('option');
  await user.click(options[options.length - 1]!);
  return screen.findByRole('dialog', { name: 'Inserir bloco de Produto vinculado' });
}

describe('ArticleBodyProductFlow', () => {
  it('menu "/": Produto vinculado disponível — inserir substitui exatamente o bloco vazio do comando', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    const onChange = jest.fn();
    await renderEditor({ onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);

    expect(editor).not.toHaveTextContent('/produto');

    const select = await screen.findByLabelText('Produto vinculado');
    await user.selectOptions(select, PRODUCT_ID);
    await user.click(screen.getByRole('button', { name: 'Inserir bloco' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByText(PRODUCT_NAME);

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(`productId: ${PRODUCT_ID}`)),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(':::product'));
  });

  it('inserido como último bloco do documento — cria um parágrafo vazio para o caret continuar editável depois dele (mesma correção já validada para ImageNode)', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    const onChange = jest.fn();
    await renderEditor({ onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);
    await user.selectOptions(await screen.findByLabelText('Produto vinculado'), PRODUCT_ID);
    await user.click(screen.getByRole('button', { name: 'Inserir bloco' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByText(PRODUCT_NAME);

    act(() => {
      insertTextAtCurrentSelection(editor, 'Depois do bloco');
    });

    const finalMarkdown = await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
      expect(lastCall).toContain('Depois do bloco');
      return lastCall;
    });
    expect(finalMarkdown).toBe(
      `:::product\nversion: 1\nproductId: ${PRODUCT_ID}\n:::\n\nDepois do bloco`,
    );
  });

  it('nenhum Produto vinculado ao Artigo: diálogo mostra mensagem explicativa, sem seletor; "Fechar" não insere nada e devolve o caret', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch([], []);
    const onChange = jest.fn();
    await renderEditor({ onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);

    expect(
      await screen.findByText(
        'Nenhum Produto vinculado a este Artigo. Vincule um Produto na seção "Produtos vinculados" antes de inserir o bloco.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Produto vinculado')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(editor).not.toHaveTextContent(':::product');

    act(() => {
      insertTextAtCurrentSelection(editor, 'Ainda editável');
    });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Ainda editável'));
  });

  it('fonte compartilhada ainda carregando: diálogo mostra estado de carregamento', async () => {
    const user = userEvent.setup();
    mockProductLookupLoading();
    await renderEditor();

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);

    expect(screen.getByText('Carregando Produtos vinculados...')).toBeInTheDocument();
    expect(screen.queryByLabelText('Produto vinculado')).not.toBeInTheDocument();
  });

  it('fonte compartilhada com erro: diálogo mostra mensagem genérica; "Fechar" devolve o caret', async () => {
    const user = userEvent.setup();
    mockProductLookupError();
    const onChange = jest.fn();
    await renderEditor({ onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);

    expect(
      await screen.findByText('Não foi possível carregar os Produtos vinculados a este Artigo.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelar a inserção não insere nada e devolve o caret para o bloco original, ainda editável', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    const onChange = jest.fn();
    await renderEditor({ onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await openInsertDialogViaSlashMenu(editor, user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(editor).not.toHaveTextContent(':::product');

    act(() => {
      insertTextAtCurrentSelection(editor, 'Texto após cancelar');
    });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Texto após cancelar'));
  });

  it('editar um bloco existente: "Editar bloco de Produto vinculado" abre com o Produto atual pré-selecionado; trocar e salvar atualiza o productId (nunca offerId/nome/preço)', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch(
      [PRODUCT_ID, OTHER_PRODUCT_ID],
      [makeProduct(PRODUCT_ID, PRODUCT_NAME), makeProduct(OTHER_PRODUCT_ID, OTHER_PRODUCT_NAME)],
    );
    const initialValue = `:::product\nversion: 1\nproductId: ${PRODUCT_ID}\n:::`;
    const onChange = jest.fn();
    await renderEditor({ initialValue, onChange });

    await screen.findByText(PRODUCT_NAME);
    await user.click(screen.getByRole('button', { name: 'Editar bloco de Produto vinculado' }));

    const dialog = await screen.findByRole('dialog', { name: 'Editar bloco de Produto vinculado' });
    const select = await screen.findByLabelText('Produto vinculado');
    expect(select).toHaveValue(PRODUCT_ID);

    await user.selectOptions(select, OTHER_PRODUCT_ID);
    await user.click(screen.getByRole('button', { name: 'Salvar Produto' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await screen.findByText(OTHER_PRODUCT_NAME);
    expect(screen.queryByText(PRODUCT_NAME)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        `:::product\nversion: 1\nproductId: ${OTHER_PRODUCT_ID}\n:::`,
      ),
    );
  });

  it('cancelar a edição preserva o productId original', async () => {
    const user = userEvent.setup();
    mockProductLookupFetch(
      [PRODUCT_ID, OTHER_PRODUCT_ID],
      [makeProduct(PRODUCT_ID, PRODUCT_NAME), makeProduct(OTHER_PRODUCT_ID, OTHER_PRODUCT_NAME)],
    );
    const initialValue = `:::product\nversion: 1\nproductId: ${PRODUCT_ID}\n:::`;
    const onChange = jest.fn();
    await renderEditor({ initialValue, onChange });

    await screen.findByText(PRODUCT_NAME);
    await user.click(screen.getByRole('button', { name: 'Editar bloco de Produto vinculado' }));
    await screen.findByRole('dialog', { name: 'Editar bloco de Produto vinculado' });
    await user.selectOptions(await screen.findByLabelText('Produto vinculado'), OTHER_PRODUCT_ID);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByText(PRODUCT_NAME);
    expect(onChange).not.toHaveBeenCalled();
  });
});
