import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryList } from './category-list';

function makeCategory(
  overrides: Partial<{ id: string; name: string; slug: string; archivedAt: string | null }> = {},
) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    name: overrides.name ?? 'Eletrônicos',
    slug: overrides.slug ?? 'eletronicos',
    archivedAt: overrides.archivedAt ?? null,
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

describe('CategoryList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    render(<CategoryList siteSlug="fastcompre" />);

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico: mostra mensagem', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' }));
    render(<CategoryList siteSlug="fastcompre" />);

    expect(
      await screen.findByText('Não foi possível carregar as Categorias. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('lista vazia (totalPages: 0): mostra mensagem acessível, sem "Página X de Y", paginação desabilitada', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    render(<CategoryList siteSlug="fastcompre" />);

    expect(await screen.findByText('Nenhuma Categoria encontrada.')).toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('lista com itens: renderiza nome e link para /:id, indica arquivada', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [
          makeCategory({ name: 'Eletrônicos' }),
          makeCategory({
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Móveis',
            archivedAt: '2026-01-02T00:00:00.000Z',
          }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      }),
    );
    render(<CategoryList siteSlug="fastcompre" />);

    const link = await screen.findByRole('link', { name: 'Eletrônicos' });
    expect(link).toHaveAttribute('href', '/fastcompre/categories/11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: 'Móveis (arquivada)' })).toBeInTheDocument();
  });

  it('link "Nova Categoria" aponta para /:siteSlug/categories/new', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    render(<CategoryList siteSlug="fastcompre" />);

    expect(await screen.findByRole('link', { name: 'Nova Categoria' })).toHaveAttribute(
      'href',
      '/fastcompre/categories/new',
    );
  });

  it('paginação: "Próxima" busca a página seguinte com o page correto; "Anterior" desabilitado na primeira página', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const page = url.searchParams.get('page');
      return jsonResponse(200, {
        items: [makeCategory({ name: `Categoria da página ${page}` })],
        page: Number(page),
        pageSize: 20,
        total: 40,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    render(<CategoryList siteSlug="fastcompre" />);

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const lastUrl = new URL(String(lastCall[0]));
    expect(lastUrl.searchParams.get('page')).toBe('2');
  });

  it('filtro de status: monta a URL com/sem archived conforme a opção e reseta a página para 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    global.fetch = fetchMock;

    render(<CategoryList siteSlug="fastcompre" />);
    await screen.findByText('Nenhuma Categoria encontrada.');

    await user.selectOptions(screen.getByLabelText('Status'), 'Arquivadas');
    await waitFor(() => {
      const lastUrl = new URL(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]));
      expect(lastUrl.searchParams.get('archived')).toBe('true');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });

    await user.selectOptions(screen.getByLabelText('Status'), 'Ativas');
    await waitFor(() => {
      const lastUrl = new URL(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]));
      expect(lastUrl.searchParams.get('archived')).toBe('false');
    });

    await user.selectOptions(screen.getByLabelText('Status'), 'Todas');
    await waitFor(() => {
      const lastUrl = new URL(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]));
      expect(lastUrl.searchParams.has('archived')).toBe(false);
    });
  });
});
