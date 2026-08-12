import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Marketplace, Offer } from '../../../generated/prisma/client';

export interface UpdateOfferInput {
  siteId: string;
  productId: string;
  id: string;
  marketplace?: Marketplace;
  price?: string;
  currency?: string;
  affiliateUrl?: string;
  inStock?: boolean;
}

export type UpdateOfferResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'NOT_FOUND' };

/**
 * Caso de uso INTERNO de atualização de Oferta (CAT-018) — sem controller
 * próprio (Architecture.md: "as operações de domínio correspondentes...
 * deixam de ter controller HTTP próprio"). Não conhece autorização,
 * `TenantContext`, revalidação nem `REV-005` — só coordena a persistência
 * pelo repository. Só é chamável pelo orquestrador HTTP-facing que expõe
 * `PATCH /admin/sites/:siteSlug/products/:productId/offers/:id` (REV-012),
 * e só depois de suas próprias guards/`@MinRole` já terem autorizado a
 * requisição.
 *
 * Só delega ao repository — sem regra de negócio adicional além do que já
 * está descrito em `PrismaOfferRepository.updateBySite` (identidade por
 * `id + siteId + productId`, sem condição de estado, `archivedAt` sempre
 * preservado, nenhum campo nulável).
 */
@Injectable()
export class UpdateOfferUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: UpdateOfferInput): Promise<UpdateOfferResult> {
    return this.offerRepository.updateBySite(input);
  }
}
