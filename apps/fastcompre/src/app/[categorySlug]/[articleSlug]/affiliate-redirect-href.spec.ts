import { describe, expect, it } from '@jest/globals';
import { affiliateRedirectHref } from './affiliate-redirect-href';

/**
 * `env.SITE_SLUG`/`env.AFFILIATE_REDIRECT_URL` vêm fixados por
 * `jest.setup.ts` ('test-site' / 'http://localhost:3000') — mesmos valores
 * já usados pelas asserções de link em `page.spec.tsx`. Esta função não
 * depende de nenhum mock de módulo (só de `env`, que já está determinístico
 * antes de qualquer teste rodar), por isso é importada estaticamente, sem o
 * padrão `jest.doMock()` + `import()` dinâmico usado pelos specs que
 * precisam variar mocks entre casos.
 *
 * Cobre o critério "comportamento preservado de `affiliateRedirectHref`"
 * (UXW-005A) — mesma URL que `page.spec.tsx` já validava antes da extração.
 */
describe('affiliateRedirectHref', () => {
  it('monta a URL absoluta de redirect com offerId e articleId', () => {
    const href = affiliateRedirectHref(
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(href).toBe(
      'http://localhost:3000/r/test-site/33333333-3333-4333-8333-333333333333' +
        '?articleId=11111111-1111-4111-8111-111111111111',
    );
  });

  it('gera hrefs distintos para offerIds diferentes, preservando o mesmo articleId', () => {
    const articleId = '11111111-1111-4111-8111-111111111111';

    const first = affiliateRedirectHref('33333333-3333-4333-8333-333333333333', articleId);
    const second = affiliateRedirectHref('99999999-9999-4999-8999-999999999999', articleId);

    expect(first).not.toBe(second);
    expect(first).toContain('33333333-3333-4333-8333-333333333333');
    expect(second).toContain('99999999-9999-4999-8999-999999999999');
  });
});
