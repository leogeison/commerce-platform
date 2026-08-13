import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fetchAllAuthors } from './fetch-all-authors';

function makeAuthor(id: string, name: string) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    userId: null,
    name,
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

describe('fetchAllAuthors', () => {
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
          items: [makeAuthor('11111111-1111-4111-8111-111111111111', 'Ana Reviewer')],
          page: 1,
          pageSize: 100,
          total: 2,
          totalPages: 2,
        });
      }

      return jsonResponse(200, {
        items: [makeAuthor('22222222-2222-4222-8222-222222222222', 'Bruno Editor')],
        page: 2,
        pageSize: 100,
        total: 2,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    const result = await fetchAllAuthors('fastcompre');

    expect(result.map((author) => author.name)).toEqual(['Ana Reviewer', 'Bruno Editor']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondCallUrl.searchParams.get('page')).toBe('2');
  });

  it('página única (totalPages: 1): busca só uma vez, sem tentar uma segunda página', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeAuthor('11111111-1111-4111-8111-111111111111', 'Ana Reviewer')],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      }),
    );
    global.fetch = fetchMock;

    const result = await fetchAllAuthors('fastcompre');

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sem resultados (totalPages: 0): retorna lista vazia, busca só uma vez', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }));
    global.fetch = fetchMock;

    const result = await fetchAllAuthors('fastcompre');

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
