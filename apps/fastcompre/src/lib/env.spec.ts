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

  it('expõe SITE_SLUG e API_URL quando ambas estão presentes e válidas', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'http://localhost:3000';

    const { env } = await import('./env');

    expect(env).toEqual({ SITE_SLUG: 'fastcompre', API_URL: 'http://localhost:3000' });
  });

  it('lança erro quando SITE_SLUG está ausente', async () => {
    delete process.env.SITE_SLUG;
    process.env.API_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando SITE_SLUG é uma string vazia', async () => {
    process.env.SITE_SLUG = '';
    process.env.API_URL = 'http://localhost:3000';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando API_URL está ausente', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    delete process.env.API_URL;

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando API_URL não é uma URL válida', async () => {
    process.env.SITE_SLUG = 'fastcompre';
    process.env.API_URL = 'not-a-url';

    await expect(import('./env')).rejects.toThrow();
  });
});
