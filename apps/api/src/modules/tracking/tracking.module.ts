import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { AFFILIATE_CLICK_EXISTENCE_CHECKER } from './domain/affiliate-click-existence-checker';
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
 * `PrismaAffiliateClickRepository` registrada uma única vez como provider
 * "de verdade" (não `useClass` por token), e os dois tokens de porta
 * (`AFFILIATE_CLICK_RECORDER`, TRK-004; `AFFILIATE_CLICK_EXISTENCE_CHECKER`,
 * TRK-010) apontam para essa mesma instância via `useExisting` — uma classe,
 * uma tabela (`AffiliateClick`), duas portas separadas (escrita/leitura,
 * ver o próprio arquivo de `AffiliateClickExistenceChecker`). `useExisting`
 * em vez de dois `useClass` independentes: evita o Nest instanciar a classe
 * duas vezes para a mesma dependência (`PrismaService`) sem necessidade.
 *
 * Só os tokens são exportados — `PrismaAffiliateClickRepository` nunca é
 * injetável fora deste módulo; quem consome (`ApplicationModule`/
 * `HandleAffiliateRedirectUseCase`/`RemoveOfferUseCase`) depende só de
 * `AffiliateClickRecorder`/`AffiliateClickExistenceChecker`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PrismaAffiliateClickRepository,
    {
      provide: AFFILIATE_CLICK_RECORDER,
      useExisting: PrismaAffiliateClickRepository,
    },
    {
      provide: AFFILIATE_CLICK_EXISTENCE_CHECKER,
      useExisting: PrismaAffiliateClickRepository,
    },
  ],
  exports: [AFFILIATE_CLICK_RECORDER, AFFILIATE_CLICK_EXISTENCE_CHECKER],
})
export class TrackingModule {}
