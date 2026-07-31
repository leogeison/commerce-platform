import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../src/shared/database/database.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository';

/**
 * Prova da AUTH-001: criar/buscar `User` funciona, e o e-mail é sempre
 * normalizado para minúsculas antes de salvar/consultar — a ponto de
 * `A@x.com` e `a@x.com` colidirem (mesmo registro, e uma segunda criação
 * com case diferente do mesmo e-mail viola a constraint `@unique`).
 *
 * Exige Postgres real, mesmo requisito já documentado para
 * `database.e2e-spec.ts`/`provision-tenant.e2e-spec.ts`.
 */
describe('PrismaUserRepository (integração)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [PrismaUserRepository],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(PrismaUserRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'auth001-' } },
    });
  });

  it('cria e busca um User pelo e-mail', async () => {
    const created = await repository.create({
      email: 'auth001-basic@test.com',
      passwordHash: 'fixture-hash-not-a-real-password',
      name: 'Fixture User',
    });

    const found = await repository.findByEmail('auth001-basic@test.com');

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.email).toBe('auth001-basic@test.com');
  });

  it('normaliza o e-mail para minúsculas ao criar', async () => {
    const created = await repository.create({
      email: 'AUTH001-Normalize@Test.com',
      passwordHash: 'fixture-hash-not-a-real-password',
    });

    expect(created.email).toBe('auth001-normalize@test.com');
  });

  it('A@x.com e a@x.com colidem: busca com case diferente encontra o mesmo User', async () => {
    const created = await repository.create({
      email: 'AUTH001-Collide@Test.com',
      passwordHash: 'fixture-hash-not-a-real-password',
    });

    const found = await repository.findByEmail('auth001-collide@test.com');

    expect(found?.id).toBe(created.id);
  });

  it('A@x.com e a@x.com colidem: criar duas vezes com case diferente viola unicidade', async () => {
    await repository.create({
      email: 'AUTH001-Unique@Test.com',
      passwordHash: 'fixture-hash-not-a-real-password',
    });

    await expect(
      repository.create({
        email: 'auth001-unique@test.com',
        passwordHash: 'fixture-hash-not-a-real-password',
      }),
    ).rejects.toThrow();
  });
});
