import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

export interface RevertArticleToDraftInput {
  siteId: string;
  id: string;
}

export type RevertArticleToDraftResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Caso de uso de transição `PENDING_REVIEW → DRAFT` (EDT-013).
 *
 * Só delega ao repository — transição incondicional (dado o status de
 * origem correto); a estratégia atômica já acontece em
 * `PrismaArticleRepository.revertToDraft`.
 */
@Injectable()
export class RevertArticleToDraftUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: RevertArticleToDraftInput): Promise<RevertArticleToDraftResult> {
    return this.articleRepository.revertToDraft(input.siteId, input.id);
  }
}
