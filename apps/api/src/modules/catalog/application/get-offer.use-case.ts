import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `GetCategoryUseCase`/`GetProductUseCase`.
 */
export interface GetOfferInput {
  siteId: string;
  productId: string;
  id: string;
}

/**
 * Caso de uso de detalhe de Oferta (CAT-017). Espelha `GetProductUseCase`:
 * só delega ao repository, `null` cobre "não existe"/"de outro Site"/"de
 * outro Produto" sem distinção.
 */
@Injectable()
export class GetOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: GetOfferInput): Promise<Offer | null> {
    return this.offerRepository.findOneByProductAndSite(
      input.siteId,
      input.productId,
      input.id,
    );
  }
}
