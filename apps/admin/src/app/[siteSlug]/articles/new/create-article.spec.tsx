import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from 'lexical';
import { CreateArticle } from './create-article';

/**
 * Helper de teste ESTRITO A ESTA ÁREA (Artigos) — mesma estratégia já
 * aprovada em `article-form.spec.tsx` para o cenário de editor Lexical
 * vazio (ver o racional completo lá): `jsdom`/
 * `@testing-library/user-event` não consegue simular de forma confiável
 * a primeira digitação num editor Lexical estruturalmente vazio (causa
 * raiz já comprovada por diagnóstico, não um bug de produção). Em vez de
 * `user.type()`, este helper obtém a instância REAL do `LexicalEditor`
 * via API pública (`getNearestEditorFromDOMNode`) e insere o texto a
 * nível de modelo, via APIs públicas do Lexical
 * (`$getRoot().selectStart()` + `$getSelection()` +
 * `$isRangeSelection()` + `RangeSelection.insertText()`), deixando o
 * `OnChangePlugin` + `ChangeTrackerPlugin` reais (nenhum mockado)
 * propagarem a mudança normalmente para `ArticleBodyEditor.onChange` →
 * `ArticleForm.setBodyMdx`. `bodyMdx` inicial de `CreateArticle` é
 * sempre `''` (editor vazio), então nenhum atalho de Markdown (fora de
 * escopo da UXE-006) é exercitado por essa inserção — o texto
 * `'# Introdução'` entra como texto literal, exatamente como entraria
 * digitado num `<textarea>` sem nenhuma conversão automática.
 */
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

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function renderCreateArticle() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <CreateArticle siteSlug="fastcompre" />
    </AppRouterContext.Provider>,
  );
}

function emptyPaginated() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
}

function mockFetch(createResponse: () => Response) {
  global.fetch = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('/categories') || url.includes('/authors')) {
      return emptyPaginated();
    }
    if (init?.method === 'POST') {
      return createResponse();
    }
    return emptyPaginated();
  });
}

function articleResponse() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: 'Melhor fone Bluetooth',
    slug: 'melhor-fone-bluetooth',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx: '',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CreateArticle', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('submit válido com bodyMdx vazio: POST omite bodyMdx (e demais campos opcionais vazios), redireciona para /:siteSlug/articles/:id', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, articleResponse()));
    const fetchMock = global.fetch as jest.Mock<typeof fetch>;

    renderCreateArticle();

    await screen.findByRole('option', { name: 'Nenhuma' });
    await user.type(screen.getByLabelText('Título'), 'Melhor fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'melhor-fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/articles/11111111-1111-4111-8111-111111111111'),
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const capturedBody = postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
    expect(capturedBody).toEqual({
      type: 'REVIEW',
      title: 'Melhor fone Bluetooth',
      slug: 'melhor-fone-bluetooth',
    });
    expect(capturedBody).not.toHaveProperty('bodyMdx');
    expect(capturedBody).not.toHaveProperty('categoryId');
    expect(capturedBody).not.toHaveProperty('authorId');
    expect(capturedBody).not.toHaveProperty('metaDescription');
    expect(capturedBody).not.toHaveProperty('coverImageUrl');
  });

  it('submit válido com bodyMdx preenchido: POST inclui bodyMdx', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, articleResponse()));
    const fetchMock = global.fetch as jest.Mock<typeof fetch>;

    renderCreateArticle();

    await screen.findByRole('option', { name: 'Nenhuma' });
    await user.type(screen.getByLabelText('Título'), 'Melhor fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'melhor-fone-bluetooth');
    const bodyField = screen.getByLabelText('Corpo (Markdown)');
    // Ver o racional completo em `insertTextIntoEmptyLexicalEditor`: a
    // primeira digitação num editor Lexical vazio não é confiável via
    // `user.type()` no jsdom, então a inserção é feita a nível de
    // modelo, via API pública do Lexical, com o OnChangePlugin/
    // ChangeTrackerPlugin reais propagando a mudança normalmente.
    await user.click(bodyField);
    act(() => {
      insertTextIntoEmptyLexicalEditor(bodyField, '# Introdução');
    });
    await waitFor(() => expect(bodyField).toHaveTextContent('# Introdução'));

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const capturedBody = postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
    expect(capturedBody.bodyMdx).toBe('# Introdução');
  });

  it('nunca envia status/publishedAt no corpo do POST', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, articleResponse()));
    const fetchMock = global.fetch as jest.Mock<typeof fetch>;

    renderCreateArticle();

    await screen.findByRole('option', { name: 'Nenhuma' });
    await user.type(screen.getByLabelText('Título'), 'Melhor fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'melhor-fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const capturedBody = postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
    expect(capturedBody).not.toHaveProperty('status');
    expect(capturedBody).not.toHaveProperty('publishedAt');
  });

  it('erro de negócio (409, slug em conflito): mostra a mensagem da API, sem navegar', async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Já existe um Artigo com este slug neste Site.',
      }),
    );

    renderCreateArticle();

    await screen.findByRole('option', { name: 'Nenhuma' });
    await user.type(screen.getByLabelText('Título'), 'Melhor fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'melhor-fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Já existe um Artigo com este slug neste Site.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
