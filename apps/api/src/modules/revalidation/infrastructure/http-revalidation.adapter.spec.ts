import { HttpRevalidationAdapter } from './http-revalidation.adapter';

const TARGET_URL = 'https://fastcompre.example.com';
const SECRET = 'a-secret-with-16-chars-or-more';
const INPUT = { siteSlug: 'fastcompre', articleSlug: 'melhor-fone-bluetooth' };

function mockFetchOnce(response: { ok: boolean; status: number }) {
  const fetchMock = jest.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('HttpRevalidationAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama POST na URL /api/internal/revalidate montada a partir de targetUrl', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await adapter.revalidate(INPUT);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://fastcompre.example.com/api/internal/revalidate');
    expect(init.method).toBe('POST');
  });

  it('envia Content-Type e o header x-revalidation-secret com o segredo correto', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await adapter.revalidate(INPUT);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-revalidation-secret': SECRET,
    });
  });

  it('envia o payload como JSON de siteSlug/articleSlug', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await adapter.revalidate(INPUT);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify(INPUT));
  });

  it('usa um sinal de AbortSignal.timeout(5000)', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await adapter.revalidate(INPUT);

    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(timeoutSpy.mock.results[0]?.value);
  });

  it('resolve sem lançar quando a resposta é 2xx', async () => {
    mockFetchOnce({ ok: true, status: 204 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await expect(adapter.revalidate(INPUT)).resolves.toBeUndefined();
  });

  it('lança um erro contendo o status quando a resposta não é 2xx', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await expect(adapter.revalidate(INPUT)).rejects.toThrow(/401/);
  });

  it('propaga erro de rede quando fetch rejeita', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await expect(adapter.revalidate(INPUT)).rejects.toThrow('network down');
  });

  it('propaga erro de timeout quando fetch rejeita com TimeoutError', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')) as unknown as typeof fetch;
    const adapter = new HttpRevalidationAdapter(TARGET_URL, SECRET);

    await expect(adapter.revalidate(INPUT)).rejects.toThrow('The operation was aborted.');
  });
});
