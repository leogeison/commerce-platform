import { describe, expect, it } from '@jest/globals';
import robots from './robots';

/**
 * `robots.ts` não faz `fetch()`, só lê `env.SITE_URL` — já fixado por
 * `jest.setup.ts` (`http://localhost:3001`), então este teste importa o
 * módulo estaticamente, sem `jest.doMock`/import dinâmico (mesmo padrão de
 * `client.spec.ts`, que também não varia `env` por teste).
 */
describe('robots', () => {
  it('libera todo o rastreamento e aponta para o sitemap em SITE_URL', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'http://localhost:3001/sitemap.xml',
    });
  });
});
