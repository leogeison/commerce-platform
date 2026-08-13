import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { CreateArticle } from './create-article';

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
    await user.type(screen.getByLabelText('Corpo (Markdown)'), '# Introdução');
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
