import { Injectable } from '@nestjs/common';
import { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListOffersQuery` do contrato HTTP.
 * Mesmo raciocínio já aplicado em `ListProductsUseCase`/`ListCategoriesUseCase`.
 */
export interface ListOffersInput {
  siteId: string;
  productId: string;
  page: number;
  pageSize: number;
}

export type ListOffersResult =
  | { ok: true; items: Offer[]; page: number; pageSize: number; total: number; totalPages: number }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

/**
 * Caso de uso de listagem paginada de Oferta (CAT-016). Espelha
 * `ListProductsUseCase`: delega ao repository, calcula `totalPages`
 * (`Math.ceil(total / pageSize)`, cálculo puro, não pertence ao repository
 * nem à apresentação) — só quando o Produto existe; `PRODUCT_NOT_FOUND`
 * repassado como veio do repository, sem paginação para calcular.
 */
@Injectable()
export class ListOffersUseCase {
  constructor(private readonly offerRepository: PrismaOfferRepository) {}

  async execute(input: ListOffersInput): Promise<ListOffersResult> {
    const result = await this.offerRepository.findManyByProduct(input);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      items: result.items,
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    };
  }
}
