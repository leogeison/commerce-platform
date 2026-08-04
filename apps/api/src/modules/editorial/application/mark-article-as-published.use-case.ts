import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

export interface MarkArticleAsPublishedInput {
  siteId: string;
  id: string;
}

export type MarkArticleAsPublishedResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Caso de uso INTERNO de transição `PENDING_REVIEW → PUBLISHED` (EDT-014)
 * — sem controller próprio (Architecture.md: "nenhuma operação interna de
 * publicação ou arquivamento tem controller HTTP próprio"). Só
 * `APP-002` pode chamá-lo, depois de validar Categoria/Produto/Oferta/
 * `metaDescription`/capa — nenhuma dessas regras entra aqui.
 *
 * Só delega ao repository — transição incondicional (dado o status de
 * origem correto), sem regra de negócio adicional; a estratégia atômica
 * (`status` + `publishedAt` na mesma instrução) já acontece em
 * `PrismaArticleRepository.markAsPublished`. Nenhum disparo de
 * revalidação — isso é `REV-002`, acionado por `REV-003` só depois do
 * sucesso de `APP-002`.
 */
@Injectable()
export class MarkArticleAsPublishedUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: MarkArticleAsPublishedInput): Promise<MarkArticleAsPublishedResult> {
    return this.articleRepository.markAsPublished(input.siteId, input.id);
  }
}
