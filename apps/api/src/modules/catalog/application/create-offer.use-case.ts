import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Marketplace, Offer } from '../../../generated/prisma/client';

export interface CreateOfferInput {
  siteId: string;
  productId: string;
  marketplace: Marketplace;
  price: string;
  currency?: string;
  affiliateUrl: string;
  inStock?: boolean;
}

export type CreateOfferResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

/**
 * Caso de uso de criação de Oferta (CAT-015). Só delega ao repository —
 * mesmo raciocínio de `CreateProductUseCase`: nunca conhece `P2003` do
 * Prisma, o `PrismaOfferRepository` já traduziu antes de chegar aqui.
 */
@Injectable()
export class CreateOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: CreateOfferInput): Promise<CreateOfferResult> {
    return this.offerRepository.create(input);
  }
}
