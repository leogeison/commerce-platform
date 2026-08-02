import { Injectable } from '@nestjs/common';
import {
  PrismaProductRepository,
  type ProductWithOfferSummaries,
} from '../infrastructure/prisma-product.repository';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `GetCategoryUseCase`.
 */
export interface GetProductInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de detalhe de Produto (CAT-010). Espelha `GetCategoryUseCase`:
 * só delega ao repository, `null` cobre "não existe"/"de outro Site" sem
 * distinção. `ProductWithOfferSummaries` é reaproveitado do repository
 * (mesmo raciocínio já aceito em `GetCategoryUseCase`, que devolve o
 * próprio tipo `Category` do Prisma sem redefinir um tipo paralelo).
 */
@Injectable()
export class GetProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: GetProductInput): Promise<ProductWithOfferSummaries | null> {
    return this.productRepository.findOneBySiteWithOffers(input.siteId, input.id);
  }
}
