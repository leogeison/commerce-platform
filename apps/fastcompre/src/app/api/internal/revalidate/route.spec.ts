import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `next/cache` não tem nenhum efeito observável fora de uma requisição real
 * do Next.js — mocado para testar só o comportamento desta rota (quem é
 * chamado, com quais argumentos, em qual ordem de validação), não o cache
 * em si. Mesma disciplina de `jest.doMock()` + import dinâmico já usada em
 * todo o projeto (`jest.mock()` hoistado não funciona sob este `next/jest`).
 */
describe('POST /api/internal/revalidate', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function callRouteWith(init: { headers?: Record<string, string>; body?: unknown }) {
    const revalidatePathMock = jest.fn();
    jest.doMock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/internal/revalidate', {
      method: 'POST',
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const response = await POST(request);
    const json = await response.json();
    return { status: response.status, json, revalidatePathMock };
  }

  const VALID_HEADERS = { 'x-revalidation-secret': 'test-revalidation-secret-value' };
  const VALID_BODY = { siteSlug: 'test-site', articleSlug: 'melhor-fone-bluetooth' };

  it('revalida a árvore de rotas e o sitemap, respondendo 200, quando segredo e payload são válidos', async () => {
    const { status, json, revalidatePathMock } = await callRouteWith({
      headers: VALID_HEADERS,
      body: VALID_BODY,
    });

    expect(status).toBe(200);
    expect(json).toEqual({ revalidated: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, '/', 'layout');
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, '/sitemap.xml');
  });

  it('responde 401 e não revalida nada quando o header do segredo está ausente', async () => {
    const { status, revalidatePathMock } = await callRouteWith({ body: VALID_BODY });

    expect(status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('responde 401 e não revalida nada quando o segredo está incorreto', async () => {
    const { status, revalidatePathMock } = await callRouteWith({
      headers: { 'x-revalidation-secret': 'wrong-secret-value-1234567890' },
      body: VALID_BODY,
    });

    expect(status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('responde 400 e não revalida nada quando o payload não corresponde ao contrato', async () => {
    const { status, revalidatePathMock } = await callRouteWith({
      headers: VALID_HEADERS,
      body: { siteSlug: 'test-site' },
    });

    expect(status).toBe(400);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('responde 400 e não revalida nada quando o siteSlug do payload diverge do deployment', async () => {
    const { status, revalidatePathMock } = await callRouteWith({
      headers: VALID_HEADERS,
      body: { siteSlug: 'outro-site', articleSlug: 'melhor-fone-bluetooth' },
    });

    expect(status).toBe(400);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
