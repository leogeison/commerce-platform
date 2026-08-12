import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso. `productId` faz parte da identidade
 * contextual da Oferta (mesma decisão já tomada para `UpdateOfferInput`,
 * CAT-018) — diferente de `ArchiveProductUseCase`, que não tem um
 * recurso-pai a validar.
 */
export interface ArchiveOfferInput {
  siteId: string;
  productId: string;
  id: string;
}

/**
 * Caso de uso de arquivamento de Oferta (CAT-019) — **interno**, sem
 * controller/rota HTTP própria (endpoint real é `REV-013`). Só delega ao
 * repository, `null` cobre "não existe"/"de outro Site"/"de outro
 * Produto" — os três casos com o mesmo resultado genérico, garantidos
 * atomicamente por `PrismaOfferRepository.archiveBySite`. Idempotência
 * (incluindo preservação exata do `archivedAt` original) também é
 * responsabilidade do repository.
 */
@Injectable()
export class ArchiveOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: ArchiveOfferInput): Promise<Offer | null> {
    return this.offerRepository.archiveBySite(input.siteId, input.productId, input.id);
  }
}
