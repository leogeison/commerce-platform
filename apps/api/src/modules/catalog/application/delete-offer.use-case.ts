import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado nos demais
 * casos de uso de Oferta.
 */
export interface DeleteOfferInput {
  siteId: string;
  id: string;
}

export type DeleteOfferResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_DEPENDENTS' };

/**
 * Caso de uso de exclusão de Oferta (CAT-021) — **interno** do Catalog,
 * sem controller/rota HTTP própria (o endpoint real é `TRK-010`,
 * cross-domain, fora deste módulo, ainda não implementado). Espelha
 * `DeleteProductUseCase` (CAT-014): só delega ao repository, nunca importa
 * nada de `@nestjs/common` além de `Injectable`, nunca lança
 * `HttpException` — não conhece HTTP.
 *
 * `HAS_DEPENDENTS`/`NOT_FOUND` já chegam prontos do
 * `PrismaOfferRepository.deleteBySite` (que já traduziu `P2003`/`P2025`
 * do Prisma) — nenhuma verificação de `AffiliateClick` aqui, de propósito:
 * isso é responsabilidade de `TRK-010` (Catalog não pode depender de
 * Tracking).
 */
@Injectable()
export class DeleteOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: DeleteOfferInput): Promise<DeleteOfferResult> {
    return this.offerRepository.deleteBySite(input.siteId, input.id);
  }
}
