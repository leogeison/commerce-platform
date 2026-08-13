import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Role } from '@commerce-platform/contracts';
import { ProductList } from './product-list';
import { SiteRoleProvider } from '../site-role-context';

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 — o teste específico de `VIEWER` passa a
 * Role explicitamente.
 */
function renderList(role: Role = 'OWNER') {
  return render(
    <SiteRoleProvider value={role}>
      <ProductList siteSlug="fastcompre" />
    </SiteRoleProvider>,
  );
}

function makeProduct(overrides: Partial<{ id: string; name: string; archivedAt: string | null }> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name: overrides.name ?? 'Fone Bluetooth',
    slug: 'fone-bluetooth',
    description: null,
    imageUrl: null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCategory(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
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

function mockFetch(productsResponse: () => Response) {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return jsonResponse(200, {
        items: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      });
    }
    return productsResponse();
  });
}

describe('ProductList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    mockFetch(() => new Response());
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderList();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico: mostra mensagem', async () => {
    mockFetch(() => jsonResponse(500, { unexpected: 'shape' }));
    renderList();

    expect(
      await screen.findByText('Não foi possível carregar os Produtos. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('lista vazia: mostra mensagem acessível, sem "Página X de Y"', async () => {
    mockFetch(() => jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList();

    expect(await screen.findByText('Nenhum Produto encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  it('lista com itens: renderiza nome, link para /:id e indica arquivado', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        items: [
          makeProduct({ name: 'Fone Bluetooth' }),
          makeProduct({ id: '33333333-3333-4333-8333-333333333333', name: 'Caixa de Som', archivedAt: '2026-01-02T00:00:00.000Z' }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      }),
    );
    renderList();

    const link = await screen.findByRole('link', { name: 'Fone Bluetooth' });
    expect(link).toHaveAttribute('href', '/fastcompre/products/11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: 'Caixa de Som (arquivado)' })).toBeInTheDocument();
  });

  it('link "Novo Produto" aponta para /:siteSlug/products/new', async () => {
    mockFetch(() => jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList();

    expect(await screen.findByRole('link', { name: 'Novo Produto' })).toHaveAttribute(
      'href',
      '/fastcompre/products/new',
    );
  });

  it('paginação: "Próxima" busca a página seguinte', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
      }
      const page = url.searchParams.get('page');
      return jsonResponse(200, {
        items: [makeProduct({ name: `Produto da página ${page}` })],
        page: Number(page),
        pageSize: 20,
        total: 40,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    renderList();

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument());
  });

  it('filtro de status: monta a URL com/sem archived e reseta a página para 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/categories')) {
        return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
      }
      return jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    });
    global.fetch = fetchMock;

    renderList();
    await screen.findByText('Nenhum Produto encontrado.');

    await user.selectOptions(screen.getByLabelText('Status'), 'Arquivadas');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/products'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('archived')).toBe('true');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  it('filtro de categoria: lista Categorias arquivadas normalmente e monta a URL com categoryId', async () => {
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
      return jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    });
    global.fetch = fetchMock;

    renderList();
    await screen.findByText('Nenhum Produto encontrado.');

    expect(await screen.findByRole('option', { name: 'Descontinuados (arquivada)' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Categoria'), 'Descontinuados (arquivada)');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/products'));
      const lastUrl = new URL(String(calls[calls.length - 1][0]));
      expect(lastUrl.searchParams.get('categoryId')).toBe(ARCHIVED_CATEGORY.id);
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  // --- ADM-012: visibilidade por Role ---

  it('VIEWER: sem o link "Novo Produto"', async () => {
    mockFetch(() => jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList('VIEWER');

    await screen.findByText('Nenhum Produto encontrado.');
    expect(screen.queryByRole('link', { name: 'Novo Produto' })).not.toBeInTheDocument();
  });
});
