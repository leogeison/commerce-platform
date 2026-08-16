import type { PasswordHasher } from '../domain/password-hasher';
import type { ProvisionTenantUseCase } from '../../tenancy/application/provision-tenant.use-case';
import { BootstrapAdminCommand } from './bootstrap-admin.command';

/**
 * QA-001 — `BootstrapAdminCommand` (AUTH-013) tem uma guarda própria (senha
 * vazia) além de orquestrar hash → `ProvisionTenantUseCase` → resposta, e
 * por isso ganha teste mais completo que os passthroughs puros deste bloco.
 * O caminho real de ponta a ponta (senha utilizável no login) já é coberto
 * por `bootstrap-admin.command.e2e-spec.ts`.
 */
function buildFakePasswordHasher(hash: string) {
  return { hash: jest.fn().mockResolvedValue(hash), verify: jest.fn() } as unknown as PasswordHasher;
}

function buildFakeProvisionTenant(result: { userId: string; siteId: string; siteUserId: string }) {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as ProvisionTenantUseCase;
}

describe('BootstrapAdminCommand', () => {
  it('senha vazia: lança antes de chamar o hasher ou o ProvisionTenantUseCase', async () => {
    const passwordHasher = buildFakePasswordHasher('hash');
    const provisionTenant = buildFakeProvisionTenant({ userId: 'u', siteId: 's', siteUserId: 'su' });
    const command = new BootstrapAdminCommand(passwordHasher, provisionTenant);

    await expect(
      command.execute({
        email: 'admin@x.com',
        password: '',
        siteName: 'Site',
        siteSlug: 'site',
        siteDomain: 'site.com',
        siteLocale: 'pt-BR',
      }),
    ).rejects.toThrow('Senha não pode ser vazia.');

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(provisionTenant.execute).not.toHaveBeenCalled();
  });

  it('caminho feliz: gera hash real e delega a ProvisionTenantUseCase com os campos mapeados corretamente', async () => {
    const passwordHasher = buildFakePasswordHasher('hash-gerado');
    const provisionTenant = buildFakeProvisionTenant({
      userId: 'user-1',
      siteId: 'site-1',
      siteUserId: 'site-user-1',
    });
    const command = new BootstrapAdminCommand(passwordHasher, provisionTenant);

    const result = await command.execute({
      email: 'admin@x.com',
      password: 'senha-em-texto-puro',
      userName: 'Admin',
      siteName: 'Site',
      siteSlug: 'site',
      siteDomain: 'site.com',
      siteLocale: 'pt-BR',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('senha-em-texto-puro');
    expect(provisionTenant.execute).toHaveBeenCalledWith({
      userEmail: 'admin@x.com',
      userPasswordHash: 'hash-gerado',
      userName: 'Admin',
      siteSlug: 'site',
      siteName: 'Site',
      siteDomain: 'site.com',
      siteLocale: 'pt-BR',
    });
    expect(result).toEqual({
      userId: 'user-1',
      siteId: 'site-1',
      siteUserId: 'site-user-1',
      role: 'OWNER',
    });
  });
});
