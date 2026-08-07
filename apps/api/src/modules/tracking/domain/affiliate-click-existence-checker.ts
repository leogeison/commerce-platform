/**
 * Porta de domínio para checagem de existência de `AffiliateClick` por
 * Oferta (TRK-010).
 *
 * Mesmo molde de `affiliate-click-recorder.ts` (TRK-004): `Symbol` como
 * token de injeção + interface pura, sem nenhum import de `@nestjs/*` nem
 * do Prisma — quem consome (`RemoveOfferUseCase`, primeiro e único
 * consumidor real) nunca sabe que a implementação é Postgres/Prisma, só que
 * existe uma capacidade de perguntar se uma Oferta tem clique registrado.
 *
 * Porta separada de `AffiliateClickRecorder`, de propósito: aquela porta é
 * exclusiva de escrita ("a capacidade exposta à Application é só escrever
 * um registro, nunca ler/listar" — comentário original da própria
 * `AffiliateClickRecorder`). Uma checagem de existência é leitura, então
 * ganha token próprio em vez de ampliar o contrato de escrita.
 * `PrismaAffiliateClickRepository` (`infrastructure/`) implementa as duas
 * interfaces — mesma classe, tabela única — mas cada consumidor depende só
 * da capacidade que realmente usa.
 */
export const AFFILIATE_CLICK_EXISTENCE_CHECKER = Symbol('AffiliateClickExistenceChecker');

export interface AffiliateClickExistenceChecker {
  /** `true` se existir ao menos um `AffiliateClick` para esta Oferta neste Site. */
  existsForOffer(siteId: string, offerId: string): Promise<boolean>;
}
