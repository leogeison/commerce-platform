import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `env.ts` valida `process.env` no momento em que o módulo é importado (não
 * em uma função chamada sob demanda) — por desenho (ver comentário em
 * `env.ts`). Isso significa que, para testar cenários diferentes de
 * `process.env` neste mesmo arquivo, cada teste precisa:
 *
 * 1. ajustar `process.env` para o cenário desejado;
 * 2. `jest.resetModules()` — limpa o cache de módulos do Jest, garantindo
 *    que a próxima importação de `./env` reavalie o `envSchema.parse(...)`
 *    do zero, em vez de reaproveitar o resultado (ou o erro) já memoizado
 *    de um teste anterior;
 * 3. `await import('./env')` — importação dinâmica, resolvida em runtime
 *    (diferente de um `import` estático no topo do arquivo, que seria
 *    "hoisted" e executado uma única vez, antes de qualquer `beforeEach`
 *    conseguir ajustar `process.env`).
 *
 * Sem essa combinação, todos os testes deste arquivo estariam observando o
 * resultado da primeira importação apenas.
 */
describe('env', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('expõe SITE_SLUG, API_URL, SITE_URL e AFFILIATE_REDIRECT_URL quando todas estão presentes e válidas', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    const { env } = await import('./env');

    expect(env).toEqual({
      SITE_SLUG: 'fastcompre',
      API_URL: 'http://localhost:3000',
      SITE_URL: 'http://localhost:3001',
      AFFILIATE_REDIRECT_URL: 'http://localhost:3000',
    });
  });

  it('lança erro quando SITE_SLUG está ausente', async () => {
    delete process.env.SITE_SLUG;
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando SITE_SLUG é uma string vazia', async () => {
    process.env.SITE_SLUG = '';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando API_URL está ausente', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    delete process.env.API_URL;
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando API_URL não é uma URL válida', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'not-a-url';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando SITE_URL está ausente', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    delete process.env.SITE_URL;
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando SITE_URL não é uma URL válida', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'not-a-url';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando SITE_URL tem path além da origem', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'https://fastcompre.com.br/base';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('aceita SITE_URL com barra final (equivalente à origem sem barra)', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'https://fastcompre.com.br/';
    process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';

    const { env } = await import('./env');

    expect(env.SITE_URL).toBe('https://fastcompre.com.br/');
  });

  it('lança erro quando AFFILIATE_REDIRECT_URL está ausente', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    delete process.env.AFFILIATE_REDIRECT_URL;

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando AFFILIATE_REDIRECT_URL não é uma URL válida', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'not-a-url';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando AFFILIATE_REDIRECT_URL tem path além da origem', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';
    process.env.SITE_URL = 'http://localhost:3001';
    process.env.AFFILIATE_REDIRECT_URL = 'https://fastcompre.com.br/base';

    await expect(import('./env')).rejects.toThrow();
  });
});
