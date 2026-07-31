import { generateSessionToken, hashSessionToken } from './session-token';

describe('session-token (domínio)', () => {
  describe('generateSessionToken', () => {
    it('gera tokens sucessivos diferentes', () => {
      const tokenA = generateSessionToken();
      const tokenB = generateSessionToken();

      expect(tokenA).not.toBe(tokenB);
    });
  });

  describe('hashSessionToken', () => {
    const secret = 'e2e-test-session-secret-0000000';

    it('é determinístico para o mesmo token e o mesmo segredo', () => {
      const token = generateSessionToken();

      expect(hashSessionToken(secret, token)).toBe(
        hashSessionToken(secret, token),
      );
    });

    it('muda o hash ao trocar o token (mesmo segredo)', () => {
      const tokenA = generateSessionToken();
      const tokenB = generateSessionToken();

      expect(hashSessionToken(secret, tokenA)).not.toBe(
        hashSessionToken(secret, tokenB),
      );
    });

    it('muda o hash ao trocar o segredo (mesmo token)', () => {
      const token = generateSessionToken();
      const otherSecret = 'outro-segredo-completamente-diferente-0000';

      expect(hashSessionToken(secret, token)).not.toBe(
        hashSessionToken(otherSecret, token),
      );
    });
  });
});
