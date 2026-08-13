import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleList } from './article-list';

function makeArticle(
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    type: string;
    categoryId: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '99999999-9999-4999-8999-999999999999',
    categoryId: overrides.categoryId === undefined ? null : overrides.categoryId,
    authorId: null,
    type: overrides.type ?? 'REVIEW',
    status: overrides.status ?? 'DRAFT',
    title: overrides.title ?? 'Melhores fones de ouvido de 2026',
    slug: 'melhores-fones-de-ouvido-de-2026',
    metaDescription: null,
    coverImageUrl: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCategory(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '99999999-9999-4999-8999-999999999999',
    name,
    slug: name.toLowerCase(),
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

const ACTIVE_CATEGORY = makeCategory('aaaaaaaa-1111-4111-8111-111111111111', 'Eletrônicos');
const ARCHIVED_CATEGORY = makeCategory(
  'bbbbbbbb-2222-4222-8222-222222222222',
  'Descontinuados',
  '2026-01-02T00:00:00.000Z',
);

function emptyCategoriesResponse() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
}

function emptyArticlesResponse() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
}

function mockFetch(options: {
  articles?: () => Response;
  categories?: () => Response;
}) {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return options.categories ? options.categories() : jsonResponse(200, {
        items: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      });
    }
    return options.articles ? options.articles() : emptyArticlesResponse();
  });
}

describe('ArticleList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    render(<ArticleList siteSlug="fastcompre" />);

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico ao carregar Artigos: mostra mensagem principal e não renderiza itens', async () => {
    mockFetch({ articles: () => jsonResponse(500, { unexpected: 'shape' }) });
    render(<ArticleList siteSlug="fastcompre" />);

    expect(
      await screen.findByText('Não foi possível carregar os Artigos. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lista vazia: mostra mensagem acessível, sem "Página X de Y"', async () => {
    mockFetch({ articles: emptyArticlesResponse });
    render(<ArticleList siteSlug="fastcompre" />);

    expect(await screen.findByText('Nenhum Artigo encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  it('falha ao carregar Categorias: desabilita o filtro, mostra erro específico, mas a listagem de Artigos continua funcionando', async () => {
    mockFetch({
      categories: () => jsonResponse(500, { unexpected: 'shape' }),
      articles: () =>
        jsonResponse(200, {
          items: [makeArticle({ title: 'Artigo publicado' })],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }),
    });
    render(<ArticleList siteSlug="fastcompre" />);

    expect(await screen.findByText('Não foi possível carregar as Categorias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
    // erro de Categorias não substitui a listagem de Artigos, que segue renderizada normalmente
    expect(await screen.findByText('Artigo publicado')).toBeInTheDocument();
    expect(
      screen.queryByText('Não foi possível carregar os Artigos. Tente novamente em instantes.'),
    ).not.toBeInTheDocument();
  });

  it('item com Categoria resolvida: mostra o nome buscado da mesma lista do filtro', async () => {
    mockFetch({
      articles: () =>
        jsonResponse(200, {
          items: [makeArticle({ title: 'Review de smartphone', categoryId: ACTIVE_CATEGORY.id })],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }),
    });
    render(<ArticleList siteSlug="fastcompre" />);

    const row = (await screen.findByText('Review de smartphone')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Eletrônicos')).toBeInTheDocument();
  });

  it('item com Categoria arquivada: mostra o nome com sufixo "(arquivada)"', async () => {
    mockFetch({
      articles: () =>
        jsonResponse(200, {
          items: [makeArticle({ title: 'Comparativo antigo', categoryId: ARCHIVED_CATEGORY.id })],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }),
    });
    render(<ArticleList siteSlug="fastcompre" />);

    const row = (await screen.findByText('Comparativo antigo')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Descontinuados (arquivada)')).toBeInTheDocument();
  });

  it('item sem Categoria (categoryId: null): mostra "Sem categoria"', async () => {
    mockFetch({
      articles: () =>
        jsonResponse(200, {
          items: [makeArticle({ title: 'Guia sem categoria', categoryId: null })],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }),
    });
    render(<ArticleList siteSlug="fastcompre" />);

    const row = (await screen.findByText('Guia sem categoria')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Sem categoria')).toBeInTheDocument();
  });

  it('exibe Título, Status e Tipo com rótulos amigáveis, sem link no título', async () => {
    mockFetch({
      articles: () =>
        jsonResponse(200, {
          items: [
            makeArticle({ title: 'Artigo em revisão', status: 'PENDING_REVIEW', type: 'BUYING_GUIDE' }),
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }),
    });
    render(<ArticleList siteSlug="fastcompre" />);

    const row = (await screen.findByText('Artigo em revisão')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Em revisão')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Guia de compra')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  it('paginação: "Próxima" busca a página seguinte', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return emptyCategoriesResponse();
      }
      const page = url.searchParams.get('page');
      return jsonResponse(200, {
        items: [makeArticle({ title: `Artigo da página ${page}` })],
        page: Number(page),
        pageSize: 20,
        total: 40,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    render(<ArticleList siteSlug="fastcompre" />);

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument());
  });

  it('filtro de Status: monta a URL e reseta a página para 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return emptyCategoriesResponse();
      }
      return emptyArticlesResponse();
    });
    global.fetch = fetchMock;

    render(<ArticleList siteSlug="fastcompre" />);
    await screen.findByText('Nenhum Artigo encontrado.');

    await user.selectOptions(screen.getByLabelText('Status'), 'Publicado');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/articles'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('status')).toBe('PUBLISHED');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  it('filtro de Tipo: monta a URL e reseta a página para 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return emptyCategoriesResponse();
      }
      return emptyArticlesResponse();
    });
    global.fetch = fetchMock;

    render(<ArticleList siteSlug="fastcompre" />);
    await screen.findByText('Nenhum Artigo encontrado.');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'Promoção');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/articles'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('type')).toBe('DEAL');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  it('filtro de Categoria: lista Categorias arquivadas normalmente e monta a URL com categoryId, resetando a página para 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return jsonResponse(200, {
          items: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY],
          page: 1,
          pageSize: 100,
          total: 2,
          totalPages: 1,
        });
      }
      return emptyArticlesResponse();
    });
    global.fetch = fetchMock;

    render(<ArticleList siteSlug="fastcompre" />);
    await screen.findByText('Nenhum Artigo encontrado.');

    expect(await screen.findByRole('option', { name: 'Descontinuados (arquivada)' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Categoria'), 'Descontinuados (arquivada)');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/articles'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('categoryId')).toBe(ARCHIVED_CATEGORY.id);
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  it('combinação simultânea dos três filtros: todos aparecem juntos na mesma URL', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return jsonResponse(200, {
          items: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY],
          page: 1,
          pageSize: 100,
          total: 2,
          totalPages: 1,
        });
      }
      return emptyArticlesResponse();
    });
    global.fetch = fetchMock;

    render(<ArticleList siteSlug="fastcompre" />);
    await screen.findByText('Nenhum Artigo encontrado.');

    await user.selectOptions(screen.getByLabelText('Status'), 'Rascunho');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Review');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Eletrônicos');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/articles'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('status')).toBe('DRAFT');
      expect(lastUrl.searchParams.get('type')).toBe('REVIEW');
      expect(lastUrl.searchParams.get('categoryId')).toBe(ACTIVE_CATEGORY.id);
    });
  });
});
