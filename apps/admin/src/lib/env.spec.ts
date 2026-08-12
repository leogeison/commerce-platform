import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `env.ts` valida `process.env` no momento em que o módulo é importado (não
 * em uma função chamada sob demanda) — por desenho (ver comentário em
 * `env.ts`). Mesma técnica de `apps/fastcompre/src/lib/env.spec.ts`:
 * `jest.resetModules()` + `await import('./env')` por teste, para forçar
 * `envSchema.parse(...)` a reavaliar do zero em cada cenário.
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

  it('expõe NEXT_PUBLIC_API_URL quando presente e válida', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';

    const { env } = await import('./env');

    expect(env).toEqual({ NEXT_PUBLIC_API_URL: 'http://localhost:3000' });
  });

  it('remove a barra final de NEXT_PUBLIC_API_URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.fastcompre.com/';

    const { env } = await import('./env');

    expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.fastcompre.com');
  });

  it('lança erro quando NEXT_PUBLIC_API_URL está ausente', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando NEXT_PUBLIC_API_URL não é uma URL válida', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'not-a-url';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando NEXT_PUBLIC_API_URL tem path além da origem', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.fastcompre.com/base';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando NEXT_PUBLIC_API_URL tem query string', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.fastcompre.com/?foo=bar';

    await expect(import('./env')).rejects.toThrow();
  });

  it('lança erro quando NEXT_PUBLIC_API_URL tem hash', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.fastcompre.com/#section';

    await expect(import('./env')).rejects.toThrow();
  });
});
