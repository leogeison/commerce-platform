import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { ProvisionTenantUseCase } from '../../tenancy/application/provision-tenant.use-case';

export interface BootstrapAdminInput {
  email: string;
  /** Texto puro — só existe em memória até a linha seguinte do `execute`. */
  password: string;
  userName?: string;
  siteName: string;
  siteSlug: string;
  siteDomain: string;
  siteLocale: string;
}

export interface BootstrapAdminResult {
  userId: string;
  siteId: string;
  siteUserId: string;
  role: 'OWNER';
}

/**
 * Comando real de bootstrap do primeiro administrador (AUTH-013;
 * Architecture.md, Seção 15, "Bootstrap do primeiro administrador").
 *
 * Só orquestra: gera o hash real via `PasswordHasher` (AUTH-002) e delega a
 * criação atômica para `ProvisionTenantUseCase` (DB-013), que já normaliza
 * o e-mail. Nenhuma lógica de CLI aqui — argumentos, prompt de senha e
 * `ApplicationContext` ficam inteiramente em `scripts/bootstrap-admin.ts`,
 * que é quem chama este comando.
 *
 * Nunca vira endpoint HTTP (mesma restrição já registrada na DB-013) — este
 * arquivo não é importado por nenhum controller, nem pelo `AppModule`.
 */
@Injectable()
export class BootstrapAdminCommand {
  constructor(
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly provisionTenant: ProvisionTenantUseCase,
  ) {}

  async execute(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
    // Defesa em profundidade: o script já valida senha não-vazia antes de
    // sequer chegar aqui (validatePasswordConfirmation), mas este comando
    // não confia só nisso — é o último ponto antes do hash/banco.
    if (input.password.length === 0) {
      throw new Error('Senha não pode ser vazia.');
    }

    const userPasswordHash = await this.passwordHasher.hash(input.password);

    const result = await this.provisionTenant.execute({
      userEmail: input.email,
      userPasswordHash,
      userName: input.userName,
      siteSlug: input.siteSlug,
      siteName: input.siteName,
      siteDomain: input.siteDomain,
      siteLocale: input.siteLocale,
    });

    return { ...result, role: 'OWNER' };
  }
}
