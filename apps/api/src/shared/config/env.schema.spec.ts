import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/commerce_platform',
    SESSION_SECRET: 'a'.repeat(16),
    REVALIDATION_SECRET: 'b'.repeat(16),
  };

  it('retorna as variáveis quando o ambiente é válido', () => {
    expect(validateEnv(validEnv)).toEqual(validEnv);
  });

  it('lança erro claro quando DATABASE_URL está ausente', () => {
    expect(() =>
      validateEnv({
        SESSION_SECRET: validEnv.SESSION_SECRET,
        REVALIDATION_SECRET: validEnv.REVALIDATION_SECRET,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('lança erro claro quando SESSION_SECRET é curto demais', () => {
    expect(() =>
      validateEnv({ ...validEnv, SESSION_SECRET: 'curto' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('lança erro claro quando REVALIDATION_SECRET está ausente', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        SESSION_SECRET: validEnv.SESSION_SECRET,
      }),
    ).toThrow(/REVALIDATION_SECRET/);
  });

  it('lança erro listando todas as variáveis ausentes de uma vez', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*SESSION_SECRET[\s\S]*REVALIDATION_SECRET/,
    );
  });
});
