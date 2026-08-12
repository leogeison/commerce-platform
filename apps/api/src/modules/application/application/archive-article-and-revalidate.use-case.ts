import { Inject, Injectable, Logger } from '@nestjs/common';
import { REVALIDATION_PORT, type RevalidationPort } from '../../revalidation/domain/revalidation.port';
import {
  ArchiveArticleUseCase,
  type ArchiveArticleResult,
} from '../../editorial/application/archive-article.use-case';

export interface ArchiveArticleAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  articleId: string;
}

/**
 * Único caminho HTTP que persiste `ARCHIVED`: sempre arquiva e, em seguida,
 * tenta revalidar o site público — nunca o inverso, e nunca um sem o outro
 * (Architecture.md §21). Cross-domain (Editorial + a porta de Revalidação),
 * por isso vive em `application`, não em `EditorialModule`.
 *
 * Falha de revalidação nunca desfaz o arquivamento já persistido: a
 * transação de `ArchiveArticleUseCase` já comitou antes desta chamada, e o
 * MVP não tem fila/outbox para retry (Architecture.md §21) — o único efeito
 * de uma falha aqui é um log estruturado; o resultado retornado ao chamador
 * continua sendo o sucesso do arquivamento.
 */
@Injectable()
export class ArchiveArticleAndRevalidateUseCase {
  private readonly logger = new Logger(ArchiveArticleAndRevalidateUseCase.name);

  constructor(
    private readonly archiveArticleUseCase: ArchiveArticleUseCase,
    @Inject(REVALIDATION_PORT) private readonly revalidationPort: RevalidationPort,
  ) {}

  async execute(input: ArchiveArticleAndRevalidateInput): Promise<ArchiveArticleResult> {
    const result = await this.archiveArticleUseCase.execute({
      siteId: input.siteId,
      id: input.articleId,
    });

    if (!result.ok) {
      return result;
    }

    try {
      await this.revalidationPort.revalidate({
        siteSlug: input.siteSlug,
        articleSlug: result.article.slug,
      });
    } catch (error) {
      this.logger.error(
        {
          siteId: input.siteId,
          resource: 'article',
          resourceId: result.article.id,
          affectedArticleIds: [result.article.id],
          error: error instanceof Error ? error.message : String(error),
        },
        'Falha ao revalidar cache após arquivar Artigo.',
      );
    }

    return result;
  }
}
