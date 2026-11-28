/**
 * Porta de domínio para registro de `AffiliateClick` (TRK-004).
 *
 * Mesmo molde de `identity/domain/password-hasher.ts` (AUTH-002): `Symbol`
 * como token de injeção + interface pura, sem nenhum import de `@nestjs/*`
 * nem do Prisma — quem consome (`HandleAffiliateRedirectUseCase`,
 * primeiro e único consumidor real) nunca sabe que a implementação é
 * Postgres/Prisma, só que existe uma capacidade de registrar o clique.
 *
 * Nome `AffiliateClickRecorder` (não `...Repository`): a capacidade
 * exposta à Application é só escrever um registro, nunca ler/listar —
 * nomeada pela ação, mesmo critério de `PasswordHasher`. A classe
 * concreta (`PrismaAffiliateClickRepository`, em `infrastructure/`) segue
 * a convenção do projeto para acesso a dado via Prisma, independente do
 * nome da porta que implementa.
 */
import type { Marketplace } from '@commerce-platform/contracts';

export const AFFILIATE_CLICK_RECORDER = Symbol('AffiliateClickRecorder');

/**
 * UXP-006 — o que o redirecionador respondeu para este clique:
 * `REDIRECTED` (302 para a `affiliateUrl`) ou `OFFER_ARCHIVED` (410).
 * Nunca significa chegada confirmada ao marketplace.
 */
export type AffiliateClickOutcome = 'REDIRECTED' | 'OFFER_ARCHIVED';

/**
 * Campos já validados/resolvidos por quem chama — normalizados para
 * `string | null` (nunca `undefined`), mesmo critério já usado em
 * `HandleAffiliateRedirectResult.articleId`. Sem `clickedAt`: o banco já
 * tem `@default(now())` no schema (`AffiliateClick.clickedAt`), gerar o
 * timestamp aqui duplicaria a fonte da verdade.
 */
export interface RecordAffiliateClickInput {
  siteId: string;
  offerId: string;
  articleId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referer: string | null;
  userAgent: string | null;
  /**
   * UXP-006 — estado no MOMENTO do clique, já resolvido por quem chama a
   * partir da Oferta/Artigo que ele mesmo carregou (nenhuma consulta extra).
   */
  marketplace: Marketplace;
  articleCategoryId: string | null;
  outcome: AffiliateClickOutcome;
}

export interface AffiliateClickRecorder {
  record(input: RecordAffiliateClickInput): Promise<void>;
}
