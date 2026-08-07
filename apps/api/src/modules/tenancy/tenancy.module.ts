import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PublicTenantGuard } from './presentation/public-tenant.guard';
import { SiteAuthorizationGuard } from './presentation/site-authorization.guard';

/**
 * Primeiro módulo real de `tenancy` ligado à árvore de módulos (AUTH-009) —
 * até aqui `tenancy` só existia como núcleo puro (`domain/tenant-context.ts`,
 * INF-008) e um caso de uso instanciado ad hoc em teste
 * (`ProvisionTenantUseCase`, DB-013).
 *
 * `DatabaseModule` importado explicitamente: mesmo motivo já documentado em
 * `IdentityModule` — embora `@Global()`, precisa ser importado pelo menos
 * uma vez para `PrismaService` ficar disponível; `SiteAuthorizationGuard`
 * depende dele.
 *
 * `ProvisionTenantUseCase` fica de fora de propósito: nunca é chamado via
 * DI/HTTP — é o bootstrap (AUTH-013, ainda não implementado), continua
 * instanciado ad hoc só nos próprios testes de integração.
 *
 * `SiteAuthorizationGuard` exportado: mesmo motivo da AUTH-006 — precisa
 * ser usável via `@UseGuards(SiteAuthorizationGuard)` em módulos futuros
 * (Catalog/Editorial), não só aqui.
 *
 * `PublicTenantGuard` (TRK-002) exportado pelo mesmo motivo, para o
 * caminho público: primeiro consumidor real de `resolvePublicTenantContext`
 * (INF-008), usado por `AffiliateRedirectController`
 * (`modules/application/presentation/`, registrado em
 * `ApplicationModule.controllers` desde TRK-006 — ver o próprio arquivo do
 * controller).
 */
@Module({
  imports: [DatabaseModule],
  providers: [SiteAuthorizationGuard, PublicTenantGuard],
  exports: [SiteAuthorizationGuard, PublicTenantGuard],
})
export class TenancyModule {}
