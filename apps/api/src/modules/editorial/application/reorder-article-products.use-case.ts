import { Injectable } from '@nestjs/common';
import { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';

export interface ReorderArticleProductsInput {
  siteId: string;
  articleId: string;
  productIds: string[];
}

export type ReorderArticleProductsResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'INVALID_PRODUCT_SET' };

/**
 * Caso de uso de reordenação dos Produtos vinculados ao Artigo (EDT-010).
 *
 * Só delega ao repository — a regra "só em `DRAFT`" e a validação do
 * conjunto de `productId`s já acontecem em
 * `PrismaArticleProductRepository.reorderProducts` antes de chegar aqui.
 */
@Injectable()
export class ReorderArticleProductsUseCase {
  constructor(private readonly articleProductRepository: PrismaArticleProductRepository) {}

  async execute(input: ReorderArticleProductsInput): Promise<ReorderArticleProductsResult> {
    return this.articleProductRepository.reorderProducts(input);
  }
}
