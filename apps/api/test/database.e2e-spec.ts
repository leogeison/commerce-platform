import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../src/shared/database/database.module';
import { PrismaService } from '../src/shared/database/prisma.service';

/**
 * Teste de integração de conexão da DB-012 — exige um Postgres real e
 * alcançável em `DATABASE_URL` (o `docker-compose` da DB-003 já configurado
 * localmente serve para isso).
 *
 * `jest-e2e.setup.ts` define um `DATABASE_URL` fictício via `??=` só para os
 * testes que não tocam banco (ex.: health check). Como `??=` não sobrescreve
 * uma variável já definida, para este teste passar de verdade é preciso
 * exportar o valor real ANTES de rodar o Jest, por exemplo:
 *
 *   DATABASE_URL="postgresql://user:password@localhost:5432/commerce_platform" \
 *     pnpm --filter api test:e2e
 *
 * Sem isso, a conexão será tentada com as credenciais fictícias contra o
 * Postgres real do `docker-compose` e falhará na autenticação — o que é o
 * comportamento esperado de um teste de integração, não um bug.
 */
describe('DatabaseModule (integração de conexão)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('conecta ao Postgres real e executa uma query simples', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;

    expect(result).toEqual([{ ok: 1 }]);
  });
});
