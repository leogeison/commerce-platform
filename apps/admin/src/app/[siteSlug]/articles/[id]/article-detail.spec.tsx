import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ArticleDetail } from './article-detail';

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function renderDetail() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <ArticleDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
    </AppRouterContext.Provider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyPaginated() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
}

const draftArticle = {
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
  bodyMdx: '# Conteúdo original',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Roteador de fetch cobrindo todos os efeitos independentes compostos por
 * `ArticleDetail` quando `status === 'DRAFT'`: detalhe do Artigo,
 * Categorias/Autores (para `ArticleForm`) e Produtos vinculados/catálogo
 * (para `ArticleProductsSection`).
 */
function mockFetch(options: { article: () => Response; patch?: () => Response }) {
  global.fetch = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (init?.method === 'PATCH' && url.includes('/products/reorder')) {
      return emptyPaginated();
    }
    if (init?.method === 'PATCH' && !url.includes('/products')) {
      return options.patch ? options.patch() : jsonResponse(200, draftArticle);
    }
    if (url.includes('/categories')) {
      return emptyPaginated();
    }
    if (url.includes('/authors')) {
      return emptyPaginated();
    }
    if (url.endsWith('/products')) {
      return jsonResponse(200, { productIds: [] });
    }
    if (url.includes('/products')) {
      return emptyPaginated();
    }
    return options.article();
  });
}

describe('ArticleDetail', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDetail();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('404: mostra a mensagem vinda da API', async () => {
    mockFetch({
      article: () =>
        jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Artigo não encontrado.' }),
    });
    renderDetail();

    expect(await screen.findByText('Artigo não encontrado.')).toBeInTheDocument();
  });

  it('DRAFT: renderiza ArticleForm preenchido e a seção de Produtos vinculados', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail();

    expect(await screen.findByLabelText('Título')).toHaveValue('Melhor fone Bluetooth');
    expect(screen.getByLabelText('Slug')).toHaveValue('melhor-fone-bluetooth');
    expect(screen.getByLabelText('Corpo (Markdown)')).toHaveValue('# Conteúdo original');
    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
  });

  it('status !== DRAFT (PUBLISHED): composição mínima somente leitura, sem ArticleForm nem seção de Produtos', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }) });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText(/ADM-010/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum Produto vinculado.')).not.toBeInTheDocument();
  });

  it('status !== DRAFT (PENDING_REVIEW): mesma composição mínima', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' }) });
    renderDetail();

    expect(await screen.findByText('Em revisão')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('status !== DRAFT (ARCHIVED): mesma composição mínima', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'ARCHIVED' }) });
    renderDetail();

    expect(await screen.findByText('Arquivado')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('PATCH sempre envia bodyMdx, inclusive string vazia (apagar o corpo é uma edição válida)', async () => {
    const user = userEvent.setup();
    let capturedPatchBody: unknown;
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'PATCH' && !url.includes('/products')) {
        capturedPatchBody = JSON.parse(String(init.body));
        return jsonResponse(200, { ...draftArticle, bodyMdx: '' });
      }
      if (url.includes('/categories') || url.includes('/authors')) {
        return emptyPaginated();
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      if (url.includes('/products')) {
        return emptyPaginated();
      }
      return jsonResponse(200, draftArticle);
    });

    renderDetail();

    const bodyField = await screen.findByLabelText('Corpo (Markdown)');
    await user.clear(bodyField);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(capturedPatchBody).toBeDefined());
    expect(capturedPatchBody).toMatchObject({ bodyMdx: '' });
    expect(capturedPatchBody).not.toHaveProperty('status');
    expect(capturedPatchBody).not.toHaveProperty('publishedAt');
  });

  it('PATCH: erro de negócio (409, fora de DRAFT) mostra a mensagem da API, permanece na página', async () => {
    const user = userEvent.setup();
    mockFetch({
      article: () => jsonResponse(200, draftArticle),
      patch: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Somente Artigos em DRAFT podem ser editados.',
        }),
    });
    renderDetail();

    await screen.findByLabelText('Título');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Somente Artigos em DRAFT podem ser editados.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
