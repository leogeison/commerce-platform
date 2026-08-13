import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { ArticleHealthResponse, ArticleStatus } from '@commerce-platform/contracts';
import { ArticleHealthChecklist } from './article-health-checklist';

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function healthyResponse(): ArticleHealthResponse {
  return {
    categoryActive: true,
    hasAtLeastOneProduct: true,
    allProductsHaveValidOffer: true,
    invalidProducts: [],
    slugUnique: true,
    metaDescriptionFilled: true,
    coverImagePresent: true,
    healthy: true,
  };
}

function catalogResponse(items: unknown[] = []) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

function mockFetch(options: { health?: () => Response; catalog?: () => Response } = {}) {
  const fetchMock = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/health')) {
      return options.health ? options.health() : jsonResponse(200, healthyResponse());
    }
    return options.catalog ? options.catalog() : catalogResponse();
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function render_(status: ArticleStatus = 'DRAFT', refreshKey = 0) {
  return render(
    <ArticleHealthChecklist siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status={status} refreshKey={refreshKey} />,
  );
}

describe('ArticleHealthChecklist', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each<[ArticleStatus, string]>([
    ['DRAFT', 'Preparação do Artigo'],
    ['PENDING_REVIEW', 'Prontidão para publicação'],
    ['PUBLISHED', 'Saúde operacional'],
    ['ARCHIVED', 'Informações de saúde'],
  ])('framing correto para %s: "%s"', async (status, heading) => {
    mockFetch();
    render_(status);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('ARCHIVED: aplica classe de ênfase reduzida, sem esconder o conteúdo', async () => {
    mockFetch();
    const { container } = render_('ARCHIVED');

    await screen.findByRole('heading', { name: 'Informações de saúde' });
    expect(container.querySelector('[class*="muted"]')).toBeInTheDocument();
    expect(await screen.findByText('Sem pendências.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('estado inicial: mostra "Carregando checklist..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    render_();

    expect(screen.getByText('Carregando checklist...')).toBeInTheDocument();
  });

  it('erro ao carregar /health: mostra mensagem genérica', async () => {
    mockFetch({ health: () => jsonResponse(500, {}) });
    render_();

    expect(
      await screen.findByText('Não foi possível carregar o checklist de saúde do Artigo.'),
    ).toBeInTheDocument();
  });

  it('healthy: true mostra os 6 itens como OK e "Sem pendências."', async () => {
    mockFetch();
    render_();

    expect(await screen.findByText('Sem pendências.')).toBeInTheDocument();
    const items = screen.getAllByText('OK');
    expect(items).toHaveLength(6);
    expect(screen.getByText('Categoria ativa')).toBeInTheDocument();
    expect(screen.getByText('Ao menos um Produto vinculado')).toBeInTheDocument();
    expect(screen.getByText('Todos os Produtos com Oferta válida')).toBeInTheDocument();
    expect(screen.getByText('Slug único')).toBeInTheDocument();
    expect(screen.getByText('Meta description preenchida')).toBeInTheDocument();
    expect(screen.getByText('Capa presente')).toBeInTheDocument();
  });

  it('healthy: false conta genericamente as pendências, sem presumir nenhum campo sempre true', async () => {
    mockFetch({
      health: () =>
        jsonResponse(200, {
          ...healthyResponse(),
          categoryActive: false,
          metaDescriptionFilled: false,
          coverImagePresent: false,
          slugUnique: false,
          healthy: false,
        }),
    });
    render_();

    expect(await screen.findByText('4 pendência(s) encontrada(s).')).toBeInTheDocument();
    expect(screen.getAllByText('Pendente')).toHaveLength(4);
    expect(screen.getAllByText('OK')).toHaveLength(2);
  });

  it('invalidProducts: some quando allProductsHaveValidOffer é true', async () => {
    mockFetch();
    render_();

    await screen.findByText('Sem pendências.');
    expect(screen.queryByText(/Sem nenhuma Oferta cadastrada/)).not.toBeInTheDocument();
  });

  it('invalidProducts: NO_OFFERS mostra o nome resolvido e o rótulo certo', async () => {
    mockFetch({
      health: () =>
        jsonResponse(200, {
          ...healthyResponse(),
          allProductsHaveValidOffer: false,
          invalidProducts: [{ productId: PRODUCT_ID, reason: 'NO_OFFERS' }],
          healthy: false,
        }),
      catalog: () =>
        catalogResponse([
          {
            id: PRODUCT_ID,
            siteId: '22222222-2222-4222-8222-222222222222',
            categoryId: null,
            name: 'Fone Bluetooth',
            slug: 'fone-bluetooth',
            description: null,
            imageUrl: null,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
    });
    render_();

    expect(await screen.findByText('Fone Bluetooth — Sem nenhuma Oferta cadastrada')).toBeInTheDocument();
  });

  it('invalidProducts: NO_VALID_OFFER mostra o rótulo certo', async () => {
    mockFetch({
      health: () =>
        jsonResponse(200, {
          ...healthyResponse(),
          allProductsHaveValidOffer: false,
          invalidProducts: [{ productId: PRODUCT_ID, reason: 'NO_VALID_OFFER' }],
          healthy: false,
        }),
      catalog: () =>
        catalogResponse([
          {
            id: PRODUCT_ID,
            siteId: '22222222-2222-4222-8222-222222222222',
            categoryId: null,
            name: 'Fone Bluetooth',
            slug: 'fone-bluetooth',
            description: null,
            imageUrl: null,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
    });
    render_();

    expect(
      await screen.findByText(
        'Fone Bluetooth — Nenhuma Oferta válida (arquivada, fora de estoque ou com link inválido)',
      ),
    ).toBeInTheDocument();
  });

  it('falha ao carregar o catálogo: invalidProducts cai para o productId bruto, checklist não quebra', async () => {
    mockFetch({
      health: () =>
        jsonResponse(200, {
          ...healthyResponse(),
          allProductsHaveValidOffer: false,
          invalidProducts: [{ productId: PRODUCT_ID, reason: 'NO_OFFERS' }],
          healthy: false,
        }),
      catalog: () => jsonResponse(500, {}),
    });
    render_();

    expect(await screen.findByText(`${PRODUCT_ID} — Sem nenhuma Oferta cadastrada`)).toBeInTheDocument();
  });

  it('rerender com status diferente (sem remount): refaz GET :id/health', async () => {
    const fetchMock = mockFetch({
      health: () => jsonResponse(200, healthyResponse()),
    });
    const { rerender } = render(
      <ArticleHealthChecklist siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="PENDING_REVIEW" refreshKey={0} />,
    );

    expect(await screen.findByRole('heading', { name: 'Prontidão para publicação' })).toBeInTheDocument();
    const callsAfterFirstMount = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/health')).length;

    rerender(
      <ArticleHealthChecklist siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="PUBLISHED" refreshKey={0} />,
    );

    expect(await screen.findByRole('heading', { name: 'Saúde operacional' })).toBeInTheDocument();
    const callsAfterRerender = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/health')).length;
    expect(callsAfterRerender).toBeGreaterThan(callsAfterFirstMount);
  });

  it('rerender com refreshKey diferente, mesmo status: refaz GET :id/health', async () => {
    const fetchMock = mockFetch({
      health: () => jsonResponse(200, healthyResponse()),
    });
    const { rerender } = render(
      <ArticleHealthChecklist siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="DRAFT" refreshKey={0} />,
    );

    await screen.findByText('Sem pendências.');
    const callsBefore = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/health')).length;

    rerender(<ArticleHealthChecklist siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="DRAFT" refreshKey={1} />);

    await screen.findByText('Sem pendências.');
    const callsAfter = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/health')).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it('nenhum botão/ação dentro do checklist', async () => {
    mockFetch();
    render_();

    await screen.findByText('Sem pendências.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
