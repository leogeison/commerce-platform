import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `ArchiveProductUseCase`.
 */
export interface ArchiveOfferInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de arquivamento de Oferta (CAT-019) — **interno**, sem
 * controller/rota HTTP própria (endpoint real é `REV-013`, ainda não
 * implementado, Fase 14). Espelha `ArchiveProductUseCase`: só delega ao
 * repository, `null` cobre "não existe"/"de outro Site". Idempotência é
 * responsabilidade de `PrismaOfferRepository.archiveBySite`.
 */
@Injectable()
export class ArchiveOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: ArchiveOfferInput): Promise<Offer | null> {
    return this.offerRepository.archiveBySite(input.siteId, input.id);
  }
}
