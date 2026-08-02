import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import type { Product } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado em
 * `ArchiveCategoryUseCase`.
 */
export interface ArchiveProductInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de arquivamento de Produto (CAT-012) — **interno**, sem
 * controller/rota HTTP própria (endpoint real é `REV-011`, ainda não
 * implementado, Fase 14). Espelha `ArchiveCategoryUseCase`: só delega ao
 * repository, `null` cobre "não existe"/"de outro Site". Idempotência é
 * responsabilidade de `PrismaProductRepository.archiveBySite`.
 */
@Injectable()
export class ArchiveProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: ArchiveProductInput): Promise<Product | null> {
    return this.productRepository.archiveBySite(input.siteId, input.id);
  }
}
