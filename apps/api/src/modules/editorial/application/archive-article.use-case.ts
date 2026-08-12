import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

export interface ArchiveArticleInput {
  siteId: string;
  id: string;
}

export type ArchiveArticleResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Caso de uso INTERNO de transição `PUBLISHED → ARCHIVED` — sem controller
 * próprio (Architecture.md: "nenhuma operação interna de publicação ou
 * arquivamento tem controller HTTP próprio"). Só o orquestrador HTTP-facing
 * de arquivamento pode chamá-lo, e só depois de sua própria autorização
 * (`OWNER`); nenhuma regra de autorização ou de revalidação entra aqui.
 *
 * Só delega ao repository — transição incondicional (dado o status de
 * origem correto), sem regra de negócio adicional; a estratégia atômica
 * (`updateMany` condicionado ao status de origem) já acontece em
 * `PrismaArticleRepository.archive`. Nenhum disparo de revalidação — isso é
 * responsabilidade exclusiva do orquestrador HTTP-facing, acionado só
 * depois do sucesso desta operação.
 */
@Injectable()
export class ArchiveArticleUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: ArchiveArticleInput): Promise<ArchiveArticleResult> {
    return this.articleRepository.archive(input.siteId, input.id);
  }
}
