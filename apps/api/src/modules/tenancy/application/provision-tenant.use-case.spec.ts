import type { PrismaService } from '../../../shared/database/prisma.service';
import { Role } from '../../../generated/prisma/enums';
import { ProvisionTenantUseCase } from './provision-tenant.use-case';

/**
 * QA-001 — `ProvisionTenantUseCase` (DB-013/AUTH-013) tem lógica própria
 * (normalização de e-mail, `Role.OWNER` fixo, composição do retorno a
 * partir dos 3 registros criados) e por isso ganha teste mais completo. A
 * garantia real de atomicidade (rollback total em falha no meio) só é
 * demonstrável contra Postgres de verdade — isso já é responsabilidade de
 * `provision-tenant.e2e-spec.ts`; este spec mocka `prisma.$transaction`
 * para provar que os dados enviados a cada `create` estão corretos.
 */
interface FakeTx {
  user: { create: jest.Mock };
  site: { create: jest.Mock };
  siteUser: { create: jest.Mock };
}

function buildFakePrisma(tx: FakeTx) {
  const $transaction = jest.fn().mockImplementation((callback: (tx: FakeTx) => unknown) => callback(tx));
  return { prisma: { $transaction } as unknown as PrismaService, $transaction };
}

function buildFakeTx(): FakeTx {
  return {
    user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    site: { create: jest.fn().mockResolvedValue({ id: 'site-1' }) },
    siteUser: { create: jest.fn().mockResolvedValue({ id: 'site-user-1' }) },
  };
}

describe('ProvisionTenantUseCase', () => {
  it('cria User com e-mail normalizado (trim + minúsculas), passwordHash e name recebidos tal como vieram', async () => {
    const tx = buildFakeTx();
    const { prisma } = buildFakePrisma(tx);
    const useCase = new ProvisionTenantUseCase(prisma);

    await useCase.execute({
      userEmail: '  Admin@Exemplo.COM  ',
      userPasswordHash: 'hash-pronto',
      userName: 'Admin',
      siteSlug: 'site',
      siteName: 'Site',
      siteDomain: 'site.com',
      siteLocale: 'pt-BR',
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: { email: 'admin@exemplo.com', passwordHash: 'hash-pronto', name: 'Admin' },
    });
  });

  it('cria Site com slug/name/domain/locale corretos', async () => {
    const tx = buildFakeTx();
    const { prisma } = buildFakePrisma(tx);
    const useCase = new ProvisionTenantUseCase(prisma);

    await useCase.execute({
      userEmail: 'admin@x.com',
      userPasswordHash: 'hash',
      siteSlug: 'meu-site',
      siteName: 'Meu Site',
      siteDomain: 'meusite.com',
      siteLocale: 'pt-BR',
    });

    expect(tx.site.create).toHaveBeenCalledWith({
      data: { slug: 'meu-site', name: 'Meu Site', domain: 'meusite.com', locale: 'pt-BR' },
    });
  });

  it('cria SiteUser com role fixa OWNER, ligando o User e o Site criados na mesma transação', async () => {
    const tx = buildFakeTx();
    const { prisma } = buildFakePrisma(tx);
    const useCase = new ProvisionTenantUseCase(prisma);

    await useCase.execute({
      userEmail: 'admin@x.com',
      userPasswordHash: 'hash',
      siteSlug: 'site',
      siteName: 'Site',
      siteDomain: 'site.com',
      siteLocale: 'pt-BR',
    });

    expect(tx.siteUser.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', siteId: 'site-1', role: Role.OWNER },
    });
  });

  it('devolve userId/siteId/siteUserId a partir dos 3 registros efetivamente criados', async () => {
    const tx = buildFakeTx();
    const { prisma } = buildFakePrisma(tx);
    const useCase = new ProvisionTenantUseCase(prisma);

    const result = await useCase.execute({
      userEmail: 'admin@x.com',
      userPasswordHash: 'hash',
      siteSlug: 'site',
      siteName: 'Site',
      siteDomain: 'site.com',
      siteLocale: 'pt-BR',
    });

    expect(result).toEqual({ userId: 'user-1', siteId: 'site-1', siteUserId: 'site-user-1' });
  });
});
