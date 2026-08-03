import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article, ArticleType } from '../../../generated/prisma/client';

export interface CreateArticleInput {
  siteId: string;
  type: ArticleType;
  title: string;
  slug: string;
  categoryId?: string;
  authorId?: string;
  metaDescription?: string;
  coverImageUrl?: string;
  bodyMdx?: string;
}

export type CreateArticleResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' }
  | { ok: false; reason: 'AUTHOR_NOT_FOUND' };

/**
 * Caso de uso de criação de Artigo (EDT-006).
 *
 * Só delega ao repository, mesmo padrão de `CreateAuthorUseCase`/
 * `CreateCategoryUseCase` — nenhuma regra de negócio adicional documentada
 * além do que `createArticleRequestSchema` (CTR-007) já exige na forma.
 * Nunca conhece `P2002`/`P2003`/Prisma: `PrismaArticleRepository` já
 * traduz os três casos relevantes (`SLUG_CONFLICT`, `CATEGORY_NOT_FOUND`,
 * `AUTHOR_NOT_FOUND`) para `{ ok: false, reason: ... }` antes de chegar
 * aqui.
 */
@Injectable()
export class CreateArticleUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: CreateArticleInput): Promise<CreateArticleResult> {
    return this.articleRepository.create(input);
  }
}
