import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

export interface RestoreArticleToDraftInput {
  siteId: string;
  id: string;
}

export type RestoreArticleToDraftResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Caso de uso de transição `ARCHIVED → DRAFT` (EDT-016).
 *
 * Só delega ao repository — transição incondicional (dado o status de
 * origem correto); a estratégia atômica já acontece em
 * `PrismaArticleRepository.restoreToDraft`. Role exigida (`OWNER`) é
 * decidida na camada de apresentação (`ArticlesController`), não aqui —
 * por equivaler semanticamente a desarquivar (Architecture.md §16,
 * "`OWNER` também arquiva/exclui").
 */
@Injectable()
export class RestoreArticleToDraftUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: RestoreArticleToDraftInput): Promise<RestoreArticleToDraftResult> {
    return this.articleRepository.restoreToDraft(input.siteId, input.id);
  }
}
