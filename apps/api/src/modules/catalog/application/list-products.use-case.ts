import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import type { Product } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListProductsQuery` do contrato
 * HTTP. Mesmo raciocínio já aplicado em `ListCategoriesUseCase`.
 */
export interface ListProductsInput {
  siteId: string;
  page: number;
  pageSize: number;
  categoryId?: string;
  archived?: boolean;
}

export interface ListProductsResult {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem paginada de Produto (CAT-009). Espelha
 * `ListCategoriesUseCase`: delega ao repository, calcula `totalPages`
 * (`Math.ceil(total / pageSize)`, cálculo puro, não pertence ao repository
 * nem à apresentação).
 */
@Injectable()
export class ListProductsUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    const { items, total } = await this.productRepository.findManyBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
      categoryId: input.categoryId,
      archived: input.archived,
    });

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }
}
