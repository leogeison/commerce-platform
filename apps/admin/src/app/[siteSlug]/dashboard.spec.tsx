import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Dashboard } from './dashboard';

function makeArticleSummary(overrides: Partial<{ id: string; title: string; updatedAt: string }> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: overrides.title ?? 'Rascunho em andamento',
    slug: 'rascunho-em-andamento',
    metaDescription: null,
    coverImageUrl: null,
    publishedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-20T15:30:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function renderDashboard() {
  return render(<Dashboard siteSlug="fastcompre" />);
}

describe('Dashboard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico: mostra mensagem', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' }));
    renderDashboard();

    expect(
      await screen.findByText('Não foi possível carregar os rascunhos. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('lista vazia: mostra "Nenhum rascunho em andamento.", sem nenhum CTA de criação', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }));
    renderDashboard();

    expect(await screen.findByText('Nenhum rascunho em andamento.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lista com itens: renderiza título como link para /:id e a data de atualização formatada (pt-BR)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeArticleSummary({ title: 'Melhores fones 2026', updatedAt: '2026-08-20T15:30:00.000Z' })],
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 1,
      }),
    );
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    expect(link).toHaveAttribute('href', '/fastcompre/articles/11111111-1111-4111-8111-111111111111');
    expect(
      screen.getByText((_, element) => element?.textContent === `Atualizado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date('2026-08-20T15:30:00.000Z'))}`),
    ).toBeInTheDocument();
  });

  it('request: page=1, pageSize=5, status=DRAFT, orderBy=updatedAt_desc — sem controle de paginação nem "Ver todos"', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }));
    global.fetch = fetchMock;

    renderDashboard();
    await screen.findByText('Nenhum rascunho em andamento.');

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requestedUrl.pathname).toBe('/admin/sites/fastcompre/articles');
    expect(requestedUrl.searchParams.get('page')).toBe('1');
    expect(requestedUrl.searchParams.get('pageSize')).toBe('5');
    expect(requestedUrl.searchParams.get('status')).toBe('DRAFT');
    expect(requestedUrl.searchParams.get('orderBy')).toBe('updatedAt_desc');
    expect(screen.queryByRole('button', { name: /anterior|próxima|ver todos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver todos/i })).not.toBeInTheDocument();
  });

  it('estrutura acessível: seção identificável via aria-labelledby apontando para o heading "Continuar de onde parei"', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }));
    renderDashboard();

    await screen.findByText('Nenhum rascunho em andamento.');

    const region = screen.getByRole('region', { name: 'Continuar de onde parei' });
    expect(region.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 2, name: 'Continuar de onde parei' })).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade (jest-axe) com itens', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 1,
      }),
    );
    const { container } = renderDashboard();

    await screen.findByRole('link', { name: 'Melhores fones 2026' });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('não tem violação de acessibilidade (jest-axe) no estado vazio', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }));
    const { container } = renderDashboard();

    await screen.findByText('Nenhum rascunho em andamento.');

    expect(await axe(container)).toHaveNoViolations();
  });
});
