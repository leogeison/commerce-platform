import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../shared/database/database.module';
import { AppConfigModule } from '../../../shared/config/config.module';
import { PASSWORD_HASHER } from '../domain/password-hasher';
import { Argon2PasswordHasher } from '../infrastructure/argon2-password-hasher';
import { ProvisionTenantUseCase } from '../../tenancy/application/provision-tenant.use-case';
import { BootstrapAdminCommand } from './bootstrap-admin.command';

/**
 * Módulo mínimo dedicado só ao `ApplicationContext` de
 * `scripts/bootstrap-admin.ts` (AUTH-013) — nunca importado pelo
 * `AppModule`/HTTP, nunca sobe servidor nenhum.
 *
 * Deliberadamente separado de `IdentityModule`/`TenancyModule`: registrar
 * `ProvisionTenantUseCase` no `TenancyModule` só para este CLI foi avaliado
 * e descartado (decisão explícita da AUTH-013) — `TenancyModule` continua
 * exatamente como a AUTH-009 o deixou. Em troca, a factory do
 * `PASSWORD_HASHER` é duplicada aqui (idêntica à do `IdentityModule`, 2
 * linhas) — custo aceito conscientemente em vez de importar o
 * `IdentityModule` inteiro (que traria `AuthController`, guards e
 * `HttpModule`, peso desnecessário para um comando de linha de comando) ou
 * criar mais uma abstração de compartilhamento para um único consumidor.
 *
 * `AppConfigModule`/`DatabaseModule` são os únicos reaproveitados de
 * verdade — a parte cara de duplicar (validação de env, driver adapter do
 * Prisma).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule],
  providers: [
    ProvisionTenantUseCase,
    { provide: PASSWORD_HASHER, useFactory: () => new Argon2PasswordHasher() },
    BootstrapAdminCommand,
  ],
})
export class BootstrapAdminModule {}
