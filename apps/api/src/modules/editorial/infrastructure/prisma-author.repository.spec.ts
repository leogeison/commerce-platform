import { readUniqueConstraintFields } from './prisma-author.repository';

/**
 * Teste unitário puro (sem Postgres, sem Nest) de `readUniqueConstraintFields`
 * — a função que traduz um `P2002` de `Author` para nomes de coluna,
 * cobrindo especificamente as variações de pontuação já observadas em
 * execuções reais deste projeto contra Postgres real (ver o histórico de
 * decisão em `prisma-author.repository.ts`): primeiro crase pura, depois
 * crase combinada com aspas duplas. Existe para nunca mais depender só de
 * um e2e com banco para pegar uma regressão de parsing.
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
