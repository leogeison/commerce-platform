import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { Role } from '@commerce-platform/contracts';
import { AuthorList } from './author-list';
import { SiteRoleProvider } from '../site-role-context';

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 — o teste específico de `VIEWER` passa a
 * Role explicitamente.
 */
function renderList(role: Role = 'OWNER') {
  return render(
    <SiteRoleProvider value={role}>
      <AuthorList siteSlug="fastcompre" />
    </SiteRoleProvider>,
  );
}

function makeAuthor(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    userId: null,
    name: overrides.name ?? 'Ana Souza',
    bio: null,
    avatarUrl: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('AuthorList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderList();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico: mostra mensagem', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' }));
    renderList();

    expect(
      await screen.findByText('Não foi possível carregar os Autores. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('lista vazia (totalPages: 0): mostra mensagem acessível, sem "Página X de Y", paginação desabilitada', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList();

    expect(await screen.findByText('Nenhum Autor encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('lista com itens: renderiza nome e link para /:id', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeAuthor({ name: 'Ana Souza' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      }),
    );
    renderList();

    const link = await screen.findByRole('link', { name: 'Ana Souza' });
    expect(link).toHaveAttribute('href', '/fastcompre/authors/11111111-1111-4111-8111-111111111111');
  });

  it('link "Novo Autor" aponta para /:siteSlug/authors/new', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList();

    expect(await screen.findByRole('link', { name: 'Novo Autor' })).toHaveAttribute(
      'href',
      '/fastcompre/authors/new',
    );
  });

  it('paginação: "Próxima" busca a página seguinte com o page correto; "Anterior" desabilitado na primeira página; sem filtro na URL', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const page = url.searchParams.get('page');
      return jsonResponse(200, {
        items: [makeAuthor({ name: `Autor da página ${page}` })],
        page: Number(page),
        pageSize: 20,
        total: 40,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    renderList();

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const lastUrl = new URL(String(lastCall[0]));
    expect(lastUrl.searchParams.get('page')).toBe('2');
    expect(lastUrl.searchParams.has('archived')).toBe(false);
  });

  // --- ADM-012: visibilidade por Role ---

  it('VIEWER: sem o link "Novo Autor"', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderList('VIEWER');

    await screen.findByText('Nenhum Autor encontrado.');
    expect(screen.queryByRole('link', { name: 'Novo Autor' })).not.toBeInTheDocument();
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeAuthor({ name: 'Ana Souza' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      }),
    );
    const { container } = renderList();

    await screen.findByRole('link', { name: 'Ana Souza' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
