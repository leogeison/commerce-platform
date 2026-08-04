import { Injectable } from '@nestjs/common';
import { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';

export interface LinkArticleProductInput {
  siteId: string;
  articleId: string;
  productId: string;
}

export type LinkArticleProductResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'ALREADY_LINKED' }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

/**
 * Caso de uso de vínculo de Produto ao Artigo (EDT-010).
 *
 * Só delega ao repository, mesmo padrão de `CreateArticleUseCase` — a
 * regra "só em `DRAFT`", o cálculo de posição e a tradução de
 * `P2002`/`P2003` já acontecem em
 * `PrismaArticleProductRepository.linkProduct` antes de chegar aqui.
 */
@Injectable()
export class LinkArticleProductUseCase {
  constructor(private readonly articleProductRepository: PrismaArticleProductRepository) {}

  async execute(input: LinkArticleProductInput): Promise<LinkArticleProductResult> {
    return this.articleProductRepository.linkProduct(input);
  }
}
