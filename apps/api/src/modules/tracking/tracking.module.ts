import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { AFFILIATE_CLICK_RECORDER } from './domain/affiliate-click-recorder';
import { PrismaAffiliateClickRepository } from './infrastructure/prisma-affiliate-click.repository';

/**
 * Primeiro módulo real de `tracking` (TRK-004) — até aqui `tracking` só
 * existia como contrato (`packages/contracts/src/tracking`, TRK-001) e
 * como guard público em `tenancy` (`PublicTenantGuard`, TRK-002); nenhuma
 * capacidade própria de domínio existia ainda.
 *
 * `DatabaseModule` importado explicitamente: mesmo padrão de
 * `IdentityModule`/`TenancyModule` — embora `PrismaService` seja
 * `@Global()`, cada módulo que o consome (direta ou indiretamente, via
 * `PrismaAffiliateClickRepository`) precisa importar `DatabaseModule` pelo
 * menos uma vez; nenhuma convenção nova.
 *
 * `AFFILIATE_CLICK_RECORDER` ligado a `PrismaAffiliateClickRepository` via
 * `useClass` (não `useFactory`, diferente de `PASSWORD_HASHER`/
 * `Argon2PasswordHasher`): `PrismaAffiliateClickRepository` tem uma
 * dependência real de DI (`PrismaService`), então `useClass` deixa o
 * próprio Nest resolver o construtor, em vez de instanciar manualmente.
 *
 * Só o token é exportado — `PrismaAffiliateClickRepository` nunca é
 * injetável fora deste módulo; quem consome (`ApplicationModule`/
 * `HandleAffiliateRedirectUseCase`) depende só de `AffiliateClickRecorder`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: AFFILIATE_CLICK_RECORDER,
      useClass: PrismaAffiliateClickRepository,
    },
  ],
  exports: [AFFILIATE_CLICK_RECORDER],
})
export class TrackingModule {}
