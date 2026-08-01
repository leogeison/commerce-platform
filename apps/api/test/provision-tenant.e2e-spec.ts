import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../src/shared/database/database.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ProvisionTenantUseCase } from '../src/modules/tenancy/application/provision-tenant.use-case';

/**
 * Prova da DB-013: `User + Site + SiteUser(OWNER)` se cria atomicamente, ou
 * nada se cria. Exige Postgres real (mesma exigência do
 * `database.e2e-spec.ts` da DB-012) — sem transação real de banco não há
 * como provar rollback de verdade.
 */
describe('ProvisionTenantUseCase (integração de transação)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let useCase: ProvisionTenantUseCase;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [ProvisionTenantUseCase],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    useCase = moduleRef.get(ProvisionTenantUseCase);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'db013' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'db013' } } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'owner-db013' } },
    });
  });

  it('cria User + Site + SiteUser(OWNER) atomicamente', async () => {
    const result = await useCase.execute({
      userEmail: 'owner-db013-success@test.com',
      userPasswordHash: 'fixture-hash-not-a-real-password',
      siteSlug: 'db013-success',
      siteName: 'DB-013 Success Site',
      siteDomain: 'db013-success.test',
      siteLocale: 'pt-BR',
    });

    const [user, site, siteUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: result.userId } }),
      prisma.site.findUnique({ where: { id: result.siteId } }),
      prisma.siteUser.findUnique({ where: { id: result.siteUserId } }),
    ]);

    expect(user).not.toBeNull();
    expect(site).not.toBeNull();
    expect(siteUser?.role).toBe('OWNER');
    expect(siteUser?.userId).toBe(result.userId);
    expect(siteUser?.siteId).toBe(result.siteId);
  });

  it('não deixa nenhum registro parcial quando a transação falha no meio (Site duplicado)', async () => {
    // Site conflitante pré-existente, criado FORA da transação testada — a
    // tentativa abaixo vai criar o User com sucesso e só falhar no passo
    // seguinte (Site, slug duplicado), no MEIO da transação.
    await prisma.site.create({
      data: {
        slug: 'db013-conflict',
        name: 'Site pré-existente',
        domain: 'db013-conflict-preexisting.test',
        locale: 'pt-BR',
      },
    });

    await expect(
      useCase.execute({
        userEmail: 'owner-db013-conflict@test.com',
        userPasswordHash: 'fixture-hash-not-a-real-password',
        siteSlug: 'db013-conflict',
        siteName: 'Tentativa conflitante',
        siteDomain: 'db013-conflict-attempt.test',
        siteLocale: 'pt-BR',
      }),
    ).rejects.toThrow();

    const user = await prisma.user.findUnique({
      where: { email: 'owner-db013-conflict@test.com' },
    });

    // Rollback total: o User criado antes da falha no Site não pode ter
    // sobrevivido à transação abortada.
    expect(user).toBeNull();
  });

  it('normaliza o e-mail (maiúsculas e espaços) antes de persistir o User', async () => {
    const result = await useCase.execute({
      userEmail: '  Owner-DB013-Normalize@Test.com  ',
      userPasswordHash: 'fixture-hash-not-a-real-password',
      siteSlug: 'db013-normalize',
      siteName: 'DB-013 Normalize Site',
      siteDomain: 'db013-normalize.test',
      siteLocale: 'pt-BR',
    });

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    expect(user?.email).toBe('owner-db013-normalize@test.com');

    // Mesmo e-mail, já normalizado, precisa encontrar o mesmo User — prova
    // que a busca (PrismaUserRepository, que também normaliza) e a escrita
    // deste caso de uso concordam sobre o mesmo valor persistido.
    const found = await prisma.user.findUnique({
      where: { email: 'owner-db013-normalize@test.com' },
    });
    expect(found?.id).toBe(result.userId);
  });
});
