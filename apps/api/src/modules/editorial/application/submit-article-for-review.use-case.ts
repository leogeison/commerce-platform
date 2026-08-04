import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

export interface SubmitArticleForReviewInput {
  siteId: string;
  id: string;
}

export type SubmitArticleForReviewResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Caso de uso de transição `DRAFT → PENDING_REVIEW` (EDT-012).
 *
 * Só delega ao repository — transição incondicional (dado o status de
 * origem correto), sem regra de negócio adicional; a estratégia atômica
 * já acontece em `PrismaArticleRepository.submitForReview`.
 */
@Injectable()
export class SubmitArticleForReviewUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: SubmitArticleForReviewInput): Promise<SubmitArticleForReviewResult> {
    return this.articleRepository.submitForReview(input.siteId, input.id);
  }
}
