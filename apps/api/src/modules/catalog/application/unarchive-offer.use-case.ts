import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `UnarchiveProductUseCase`.
 */
export interface UnarchiveOfferInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de desarquivamento de Oferta (CAT-020) — **interno**, sem
 * controller/rota HTTP própria (endpoint real é `REV-013`, ainda não
 * implementado, Fase 14). Espelha `UnarchiveProductUseCase`: só delega ao
 * repository, `null` cobre "não existe"/"de outro Site". Idempotência é
 * responsabilidade de `PrismaOfferRepository.unarchiveBySite`.
 */
@Injectable()
export class UnarchiveOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: UnarchiveOfferInput): Promise<Offer | null> {
    return this.offerRepository.unarchiveBySite(input.siteId, input.id);
  }
}
