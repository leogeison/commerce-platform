import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import type { Product } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `ArchiveProductUseCase`.
 */
export interface UnarchiveProductInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de desarquivamento de Produto (CAT-013) — **interno**, sem
 * controller/rota HTTP própria (endpoint real também é `REV-011`). Espelha
 * `ArchiveProductUseCase`.
 */
@Injectable()
export class UnarchiveProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: UnarchiveProductInput): Promise<Product | null> {
    return this.productRepository.unarchiveBySite(input.siteId, input.id);
  }
}
