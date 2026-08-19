import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { listPublicArticles, getPublicArticle, getPublicCategory } from './client';
import { PublicApiError } from './errors';

/**
 * `SITE_SLUG`/`API_URL` já vêm fixados por `jest.setup.ts` (`test-site` /
 * `http://localhost:3000`) — suficiente para este arquivo, que não testa
 * `env.ts` (isso é `env.spec.ts`), só o comportamento HTTP do cliente.
 */

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const validArticleSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  categorySlug: 'comparativos',
  type: 'COMPARISON',
  title: 'Melhor fone bluetooth 2026',
  slug: 'melhor-fone-bluetooth',
  metaDescription: 'Comparativo dos melhores fones bluetooth.',
  coverImageUrl: 'https://example.com/cover.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

const validArticleDetail = {
  ...validArticleSummary,
  bodyMdx: '# Corpo do artigo',
  products: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Fone X',
      description: 'Descrição do produto.',
      imageUrl: 'https://example.com/product.jpg',
      position: 0,
      offers: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          marketplace: 'AMAZON_BR',
          price: '199.90',
          currency: 'BRL',
          inStock: true,
        },
      ],
    },
  ],
  author: null,
};

const validCategory = { name: 'Comparativos', slug: 'comparativos' };

describe('listPublicArticles', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('monta a URL com os defaults do schema quando nenhuma query é passada', async () => {
    mockFetchOnce(200, {
      items: [validArticleSummary],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    await listPublicArticles();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/public/sites/test-site/articles?page=1&pageSize=20',
    );
  });

  it('inclui categorySlug/type na URL quando informados, e respeita page/pageSize customizados', async () => {
    mockFetchOnce(200, { items: [], page: 2, pageSize: 5, total: 0, totalPages: 0 });

    await listPublicArticles({ page: 2, pageSize: 5, categorySlug: 'comparativos', type: 'REVIEW' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/public/sites/test-site/articles?page=2&pageSize=5&categorySlug=comparativos&type=REVIEW',
    );
  });

  it('retorna a resposta parseada em caso de sucesso', async () => {
    const response = { items: [validArticleSummary], page: 1, pageSize: 20, total: 1, totalPages: 1 };
    mockFetchOnce(200, response);

    await expect(listPublicArticles()).resolves.toEqual(response);
  });

  it('rejeita a query antes de chamar fetch quando ela viola os limites do schema', async () => {
    global.fetch = jest.fn<typeof fetch>();

    await expect(listPublicArticles({ pageSize: 1000 })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('lança PublicApiError em 404 (nunca trata como lista vazia)', async () => {
    mockFetchOnce(404, {
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'Not Found',
      message: 'Site não encontrado.',
    });

    await expect(listPublicArticles()).rejects.toThrow(PublicApiError);
  });

  it('lança PublicApiError com statusCode/code/message extraídos do corpo ApiError em erro 5xx', async () => {
    mockFetchOnce(500, {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      error: 'Internal Server Error',
      message: 'Ocorreu um erro inesperado.',
    });

    await expect(listPublicArticles()).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro inesperado.',
    });
  });

  it('lança PublicApiError com fallback genérico quando o corpo de erro não bate com ApiError', async () => {
    mockFetchOnce(502, { unexpected: 'shape' });

    await expect(listPublicArticles()).rejects.toMatchObject({ statusCode: 502, code: undefined });
  });

  it('lança PublicApiError (INVALID_RESPONSE_SHAPE) quando a resposta 200 não bate com o contrato', async () => {
    mockFetchOnce(200, { items: 'not-an-array' });

    await expect(listPublicArticles()).rejects.toMatchObject({ code: 'INVALID_RESPONSE_SHAPE' });
  });

  it('propaga falha de rede sem capturar nem converter', async () => {
    const networkError = new TypeError('fetch failed');
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(networkError);

    await expect(listPublicArticles()).rejects.toBe(networkError);
  });
});

describe('getPublicArticle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna o artigo parseado em caso de sucesso', async () => {
    mockFetchOnce(200, validArticleDetail);

    await expect(getPublicArticle('melhor-fone-bluetooth')).resolves.toEqual(validArticleDetail);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/public/sites/test-site/articles/melhor-fone-bluetooth',
    );
  });

  it('retorna null em 404', async () => {
    mockFetchOnce(404, {
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'Not Found',
      message: 'Artigo não encontrado.',
    });

    await expect(getPublicArticle('inexistente')).resolves.toBeNull();
  });

  it('lança PublicApiError (INVALID_RESPONSE_SHAPE) quando a resposta 200 não bate com o contrato', async () => {
    mockFetchOnce(200, { id: 'not-a-uuid' });

    await expect(getPublicArticle('slug')).rejects.toMatchObject({ code: 'INVALID_RESPONSE_SHAPE' });
  });
});

describe('getPublicCategory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna a categoria parseada em caso de sucesso', async () => {
    mockFetchOnce(200, validCategory);

    await expect(getPublicCategory('comparativos')).resolves.toEqual(validCategory);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/public/sites/test-site/categories/comparativos',
    );
  });

  it('retorna null em 404', async () => {
    mockFetchOnce(404, {
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'Not Found',
      message: 'Categoria não encontrada.',
    });

    await expect(getPublicCategory('inexistente')).resolves.toBeNull();
  });
});
