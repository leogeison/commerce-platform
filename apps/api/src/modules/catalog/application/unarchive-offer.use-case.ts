import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso. `productId` faz parte da identidade
 * contextual da Oferta — mesmo critério já aplicado em `ArchiveOfferInput`.
 */
export interface UnarchiveOfferInput {
  siteId: string;
  productId: string;
  id: string;
}

/**
 * Caso de uso de desarquivamento de Oferta (CAT-020) — **interno**, sem
 * controller/rota HTTP própria (endpoint real é `REV-013`). Espelha
 * `ArchiveOfferUseCase`: só delega ao repository, `null` cobre "não
 * existe"/"de outro Site"/"de outro Produto". Idempotência é
 * responsabilidade de `PrismaOfferRepository.unarchiveBySite`.
 */
@Injectable()
export class UnarchiveOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: UnarchiveOfferInput): Promise<Offer | null> {
    return this.offerRepository.unarchiveBySite(input.siteId, input.productId, input.id);
  }
}
