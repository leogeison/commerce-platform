import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/commerce_platform',
    SESSION_SECRET: 'a'.repeat(16),
    REVALIDATION_SECRET: 'b'.repeat(16),
    ADMIN_ORIGIN: 'http://localhost:3001',
    REVALIDATION_TARGET_URL: 'http://localhost:3001',
    STORAGE_S3_BUCKET: 'my-bucket',
    STORAGE_S3_REGION: 'auto',
    STORAGE_S3_PUBLIC_URL_BASE: 'https://cdn.example.com',
  };

  it('retorna as variáveis quando o ambiente é válido (STORAGE_S3_FORCE_PATH_STYLE ausente vira false)', () => {
    expect(validateEnv(validEnv)).toEqual({
      ...validEnv,
      STORAGE_S3_FORCE_PATH_STYLE: false,
    });
  });

  it('lança erro claro quando DATABASE_URL está ausente', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        DATABASE_URL: undefined,
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
        ...validEnv,
        REVALIDATION_SECRET: undefined,
      }),
    ).toThrow(/REVALIDATION_SECRET/);
  });

  it('lança erro claro quando ADMIN_ORIGIN não é uma URL válida', () => {
    expect(() =>
      validateEnv({ ...validEnv, ADMIN_ORIGIN: 'nao-e-uma-url' }),
    ).toThrow(/ADMIN_ORIGIN/);
  });

  it('lança erro claro quando REVALIDATION_TARGET_URL está ausente', () => {
    expect(() =>
      validateEnv({ ...validEnv, REVALIDATION_TARGET_URL: undefined }),
    ).toThrow(/REVALIDATION_TARGET_URL/);
  });

  it('lança erro claro quando REVALIDATION_TARGET_URL não é uma URL válida', () => {
    expect(() =>
      validateEnv({ ...validEnv, REVALIDATION_TARGET_URL: 'nao-e-uma-url' }),
    ).toThrow(/REVALIDATION_TARGET_URL/);
  });

  it('lança erro claro quando REVALIDATION_TARGET_URL tem path além da origem', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        REVALIDATION_TARGET_URL: 'https://fastcompre.example.com/base',
      }),
    ).toThrow(/REVALIDATION_TARGET_URL/);
  });

  it('aceita REVALIDATION_TARGET_URL com barra final (equivalente à origem sem barra)', () => {
    const result = validateEnv({
      ...validEnv,
      REVALIDATION_TARGET_URL: 'https://fastcompre.example.com/',
    });

    expect(result.REVALIDATION_TARGET_URL).toBe('https://fastcompre.example.com/');
  });

  it('lança erro listando todas as variáveis ausentes de uma vez', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*SESSION_SECRET[\s\S]*REVALIDATION_SECRET[\s\S]*ADMIN_ORIGIN[\s\S]*REVALIDATION_TARGET_URL[\s\S]*STORAGE_S3_BUCKET[\s\S]*STORAGE_S3_REGION[\s\S]*STORAGE_S3_PUBLIC_URL_BASE/,
    );
  });

  it('STORAGE_S3_FORCE_PATH_STYLE=true vira boolean true', () => {
    const result = validateEnv({
      ...validEnv,
      STORAGE_S3_FORCE_PATH_STYLE: 'true',
    });

    expect(result.STORAGE_S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('credenciais de storage: ambas ausentes é válido (SDK usa a cadeia padrão da AWS)', () => {
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it('credenciais de storage: ambas presentes é válido', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        STORAGE_S3_ACCESS_KEY_ID: 'access-key',
        STORAGE_S3_SECRET_ACCESS_KEY: 'secret-key',
      }),
    ).not.toThrow();
  });

  it('credenciais de storage: só STORAGE_S3_ACCESS_KEY_ID presente é inválido', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        STORAGE_S3_ACCESS_KEY_ID: 'access-key',
      }),
    ).toThrow(/STORAGE_S3_SECRET_ACCESS_KEY/);
  });

  it('credenciais de storage: só STORAGE_S3_SECRET_ACCESS_KEY presente é inválido', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        STORAGE_S3_SECRET_ACCESS_KEY: 'secret-key',
      }),
    ).toThrow(/STORAGE_S3_ACCESS_KEY_ID/);
  });
});
