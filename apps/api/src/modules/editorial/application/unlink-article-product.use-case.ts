import { Injectable } from '@nestjs/common';
import { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';

export interface UnlinkArticleProductInput {
  siteId: string;
  articleId: string;
  productId: string;
}

export type UnlinkArticleProductResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'NOT_LINKED' };

/**
 * Caso de uso de desvínculo de Produto do Artigo (EDT-010).
 *
 * Só delega ao repository — a regra "só em `DRAFT`" e a recompactação de
 * posições já acontecem em
 * `PrismaArticleProductRepository.unlinkProduct` antes de chegar aqui.
 */
@Injectable()
export class UnlinkArticleProductUseCase {
  constructor(private readonly articleProductRepository: PrismaArticleProductRepository) {}

  async execute(input: UnlinkArticleProductInput): Promise<UnlinkArticleProductResult> {
    return this.articleProductRepository.unlinkProduct(input);
  }
}
