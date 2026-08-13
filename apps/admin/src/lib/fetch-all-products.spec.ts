import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fetchAllProducts } from './fetch-all-products';

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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('fetchAllProducts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('duas páginas: concatena os itens, busca a segunda página com pageSize=100 e para em totalPages', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('pageSize')).toBe('100');
      const page = url.searchParams.get('page');

      if (page === '1') {
        return jsonResponse(200, {
          items: [makeProduct('11111111-1111-4111-8111-111111111111', 'Fone Bluetooth')],
          page: 1,
          pageSize: 100,
          total: 2,
          totalPages: 2,
        });
      }

      return jsonResponse(200, {
        items: [makeProduct('22222222-2222-4222-8222-222222222222', 'Caixa de Som')],
        page: 2,
        pageSize: 100,
        total: 2,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    const result = await fetchAllProducts('fastcompre');

    expect(result.map((product) => product.name)).toEqual(['Fone Bluetooth', 'Caixa de Som']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondCallUrl.searchParams.get('page')).toBe('2');
  });

  it('inclui Produtos arquivados junto com ativos (sem filtro archived)', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [
          makeProduct('11111111-1111-4111-8111-111111111111', 'Fone Bluetooth'),
          makeProduct('33333333-3333-4333-8333-333333333333', 'Produto Descontinuado', '2026-01-02T00:00:00.000Z'),
        ],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      }),
    );
    global.fetch = fetchMock;

    const result = await fetchAllProducts('fastcompre');

    expect(result).toHaveLength(2);
    expect(result.some((product) => product.archivedAt !== null)).toBe(true);
  });

  it('sem resultados (totalPages: 0): retorna lista vazia, busca só uma vez', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }));
    global.fetch = fetchMock;

    const result = await fetchAllProducts('fastcompre');

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
