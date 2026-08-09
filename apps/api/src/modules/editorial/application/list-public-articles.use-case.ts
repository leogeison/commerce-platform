import { Injectable } from '@nestjs/common';
import {
  PrismaArticleRepository,
  type PublishedArticleWithCategorySlug,
} from '../infrastructure/prisma-article.repository';
import type { ArticleType } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListPublicArticlesQuery` do
 * contrato HTTP, mesmo raciocínio já aplicado em `ListArticlesUseCase`: o
 * caso de uso não deve depender do tipo da camada de transporte.
 */
export interface ListPublicArticlesInput {
  siteId: string;
  page: number;
  pageSize: number;
  categorySlug?: string;
  type?: ArticleType;
}

export interface ListPublicArticlesResult {
  items: PublishedArticleWithCategorySlug[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem pública paginada de Artigos publicados (PUB-002).
 *
 * `totalPages` calculado aqui, mesmo raciocínio de `ListArticlesUseCase`:
 * cálculo puro sobre números já devolvidos pelo repository.
 */
@Injectable()
export class ListPublicArticlesUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: ListPublicArticlesInput): Promise<ListPublicArticlesResult> {
    const { items, total } = await this.articleRepository.findManyPublishedBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
      categorySlug: input.categorySlug,
      type: input.type,
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
