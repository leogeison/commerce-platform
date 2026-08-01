import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import type { Product } from '../../../generated/prisma/client';

export interface CreateProductInput {
  siteId: string;
  categoryId?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
}

export type CreateProductResult =
  | { ok: true; product: Product }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' };

/**
 * Caso de uso de criação de Produto (CAT-008). Só delega ao repository —
 * mesmo raciocínio de `CreateCategoryUseCase`: nunca conhece `P2002`/`P2003`
 * do Prisma, o `PrismaProductRepository` já traduziu os dois antes de
 * chegar aqui.
 */
@Injectable()
export class CreateProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: CreateProductInput): Promise<CreateProductResult> {
    return this.productRepository.create(input);
  }
}
