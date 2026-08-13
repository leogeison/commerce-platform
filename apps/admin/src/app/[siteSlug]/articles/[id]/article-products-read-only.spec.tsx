import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { ArticleProductsReadOnly } from './article-products-read-only';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const SITE_SLUG = 'fastcompre';

function makeProduct(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name,
    slug: name.toLowerCase(),
    description: null,
    imageUrl: null,
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const PRODUCT_A = makeProduct('aaaaaaaa-1111-4111-8111-111111111111', 'Fone Bluetooth');
const PRODUCT_B = makeProduct('bbbbbbbb-2222-4222-8222-222222222222', 'Caixa de Som', '2026-01-02T00:00:00.000Z');

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function catalogResponse(items: ReturnType<typeof makeProduct>[]) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

function render_() {
  return render(<ArticleProductsReadOnly siteSlug={SITE_SLUG} articleId={ARTICLE_ID} />);
}

describe('ArticleProductsReadOnly', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando Produtos vinculados..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    render_();

    expect(screen.getByText('Carregando Produtos vinculados...')).toBeInTheDocument();
  });

  it('sem Produtos vinculados: mostra "Nenhum Produto vinculado."', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    render_();

    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
  });

  it('erro ao carregar: mostra mensagem genérica', async () => {
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));
    render_();

    expect(await screen.findByText('Não foi possível carregar os Produtos vinculados.')).toBeInTheDocument();
  });

  it('Produtos vinculados: lista na ordem de productIds, com nome resolvido e "(arquivado)"', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_B.id, PRODUCT_A.id] });
      }
      return catalogResponse([PRODUCT_A, PRODUCT_B]);
    });
    render_();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Caixa de Som (arquivado)');
    expect(items[1]).toHaveTextContent('Fone Bluetooth');
  });

  it('nenhum botão de vincular/remover/mover, nenhum <select>', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_A.id] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    const { container } = render_();

    await screen.findByText('Fone Bluetooth');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });

  it('nenhuma chamada POST/DELETE/PATCH é feita', async () => {
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_A.id] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    global.fetch = fetchMock;
    render_();

    await screen.findByText('Fone Bluetooth');

    const mutatingCalls = fetchMock.mock.calls.filter((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method !== undefined && init.method !== 'GET';
    });
    expect(mutatingCalls).toHaveLength(0);
  });
});
