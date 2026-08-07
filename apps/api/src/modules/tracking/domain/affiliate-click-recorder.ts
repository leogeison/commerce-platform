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
export const AFFILIATE_CLICK_RECORDER = Symbol('AffiliateClickRecorder');

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
}

export interface AffiliateClickRecorder {
  record(input: RecordAffiliateClickInput): Promise<void>;
}
