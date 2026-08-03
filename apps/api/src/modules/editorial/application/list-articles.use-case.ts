import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article, ArticleStatus, ArticleType } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListArticlesQuery` do contrato
 * HTTP (`packages/contracts`). Mesmo raciocínio já aplicado em
 * `ListAuthorsUseCase`/`ListCategoriesUseCase`: o caso de uso não deve
 * depender do tipo da camada de transporte; o controller é quem traduz
 * `ListArticlesQuery` (já validado pelo `ZodValidationPipe`) para este
 * input.
 */
export interface ListArticlesInput {
  siteId: string;
  page: number;
  pageSize: number;
  status?: ArticleStatus;
  type?: ArticleType;
  categoryId?: string;
}

export interface ListArticlesResult {
  items: Article[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem paginada de Artigo (EDT-007).
 *
 * `totalPages` calculado aqui, mesmo raciocínio de `ListAuthorsUseCase`:
 * `Math.ceil(total / pageSize)` é cálculo puro sobre números já devolvidos
 * pelo repository — não pertence a `PrismaArticleRepository` nem a
 * `article.presenter.ts`.
 */
@Injectable()
export class ListArticlesUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: ListArticlesInput): Promise<ListArticlesResult> {
    const { items, total } = await this.articleRepository.findManyBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
      status: input.status,
      type: input.type,
      categoryId: input.categoryId,
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
