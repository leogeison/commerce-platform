import { RateLimit } from './rate-limit.decorator';

describe('RateLimit decorator — validação de options', () => {
  it('aceita limit inteiro > 0 e windowMs finito > 0', () => {
    expect(() => RateLimit({ limit: 5, windowMs: 60_000 })).not.toThrow();
  });

  it.each([0, -1, 1.5])(
    'rejeita limit inválido: %p',
    (limit) => {
      expect(() => RateLimit({ limit, windowMs: 60_000 })).toThrow(
        /"limit" deve ser um inteiro maior que zero/,
      );
    },
  );

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejeita windowMs inválido: %p',
    (windowMs) => {
      expect(() => RateLimit({ limit: 5, windowMs })).toThrow(
        /"windowMs" deve ser um número finito maior que zero/,
      );
    },
  );
});
