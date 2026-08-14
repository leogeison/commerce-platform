import { isForeignKeyConstraintViolation, readUniqueConstraintFields } from './prisma-error.util';

/**
 * Teste unitário puro (sem Postgres, sem Nest) de `readUniqueConstraintFields`
 * — a função que traduz um `P2002` para nomes de coluna, cobrindo
 * especificamente as variações de pontuação já observadas em execuções
 * reais deste projeto contra Postgres real (ver o histórico de decisão em
 * `prisma-error.util.ts`): primeiro crase pura, depois crase combinada com
 * aspas duplas. Existe para nunca mais depender só de um e2e com banco
 * para pegar uma regressão de parsing.
 *
 * Movido de `prisma-author.repository.spec.ts` (EDT-001) pra cá quando a
 * função ganhou um segundo consumidor real (`PrismaArticleRepository`,
 * EDT-006) e foi extraída para este util compartilhado — mesmo
 * comportamento, mesmos casos, só o import mudou.
 */
describe('readUniqueConstraintFields', () => {
  it('extrai os campos quando a mensagem usa crase e aspas duplas combinadas: (`"siteId"`, `"userId"`)', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`"siteId"`, `"userId"`)',
    };

    expect(readUniqueConstraintFields(err)).toEqual(['siteId', 'userId']);
  });

  it('extrai os campos quando a mensagem usa só aspas duplas: ("siteId", "userId")', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: ("siteId", "userId")',
    };

    expect(readUniqueConstraintFields(err)).toEqual(['siteId', 'userId']);
  });

  it('extrai os campos quando a mensagem usa só crase: (`siteId`, `userId`)', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`siteId`, `userId`)',
    };

    expect(readUniqueConstraintFields(err)).toEqual(['siteId', 'userId']);
  });

  it('usa error.meta.target quando existir como lista de strings, sem precisar da mensagem', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the constraint: `Author_siteId_userId_key`',
      meta: { target: ['siteId', 'userId'] },
    };

    expect(readUniqueConstraintFields(err)).toEqual(['siteId', 'userId']);
  });

  it('formato desconhecido: devolve undefined em vez de inventar campos', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the constraint: `Author_siteId_userId_key`',
    };

    expect(readUniqueConstraintFields(err)).toBeUndefined();
  });

  it('campos diferentes de siteId/userId: extrai o que a mensagem realmente contém, sem filtrar', () => {
    const err = {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`id`, `siteId`)',
    };

    expect(readUniqueConstraintFields(err)).toEqual(['id', 'siteId']);
  });

  it('err não é um objeto: devolve undefined', () => {
    expect(readUniqueConstraintFields('não é um erro')).toBeUndefined();
    expect(readUniqueConstraintFields(null)).toBeUndefined();
    expect(readUniqueConstraintFields(undefined)).toBeUndefined();
  });
});

/**
 * Teste unitário puro de `isForeignKeyConstraintViolation` — cobre os dois
 * formatos reais que essa função precisa reconhecer (achado durante a
 * verificação de `REV-016`/`REV-017`, ver histórico de decisão em
 * `prisma-error.util.ts`) e confirma que nenhum outro `SQLSTATE`/erro
 * genérico bate por engano, já que o risco de transformar um `500`
 * legítimo em `409` é exatamente esse.
 */
describe('isForeignKeyConstraintViolation', () => {
  it('P2003 (formato legado, reconhecido nativamente pelo Prisma): true', () => {
    const err = { code: 'P2003' };

    expect(isForeignKeyConstraintViolation(err)).toBe(true);
  });

  it('23001 no shape real do driver adapter (Postgres real, DELETE bloqueado por ON DELETE RESTRICT): true', () => {
    const err = {
      code: 'P2039',
      meta: {
        modelName: 'Category',
        driverAdapterError: {
          cause: {
            kind: 'postgres',
            code: '23001',
            originalCode: '23001',
            message:
              'update or delete on table "Category" violates RESTRICT setting of foreign key constraint "Product_categoryId_siteId_fkey" on table "Product"',
          },
        },
      },
    };

    expect(isForeignKeyConstraintViolation(err)).toBe(true);
  });

  it('23505 (unique_violation, não é violação de FK): false', () => {
    const err = {
      code: 'P2039',
      meta: {
        driverAdapterError: { cause: { kind: 'postgres', code: '23505' } },
      },
    };

    expect(isForeignKeyConstraintViolation(err)).toBe(false);
  });

  it('23502 (not_null_violation, não é violação de FK): false', () => {
    const err = {
      code: 'P2039',
      meta: {
        driverAdapterError: { cause: { kind: 'postgres', code: '23502' } },
      },
    };

    expect(isForeignKeyConstraintViolation(err)).toBe(false);
  });

  it('erro genérico sem code/meta reconhecíveis: false', () => {
    expect(isForeignKeyConstraintViolation(new Error('algo deu errado'))).toBe(false);
    expect(isForeignKeyConstraintViolation({ code: 'P2025' })).toBe(false);
  });

  it('objeto malformado (meta/driverAdapterError/cause ausentes ou em formato inesperado): false, nunca lança', () => {
    expect(isForeignKeyConstraintViolation('não é um erro')).toBe(false);
    expect(isForeignKeyConstraintViolation(null)).toBe(false);
    expect(isForeignKeyConstraintViolation(undefined)).toBe(false);
    expect(isForeignKeyConstraintViolation({})).toBe(false);
    expect(isForeignKeyConstraintViolation({ meta: null })).toBe(false);
    expect(isForeignKeyConstraintViolation({ meta: { driverAdapterError: null } })).toBe(false);
    expect(
      isForeignKeyConstraintViolation({ meta: { driverAdapterError: { cause: 'not-an-object' } } }),
    ).toBe(false);
    expect(
      isForeignKeyConstraintViolation({ meta: { driverAdapterError: { cause: { code: 42 } } } }),
    ).toBe(false);
  });
});
