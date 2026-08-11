import { Inject, Injectable, Logger } from '@nestjs/common';
import { REVALIDATION_PORT, type RevalidationPort } from '../../revalidation/domain/revalidation.port';
import {
  PublishArticleUseCase,
  type PublishArticleResult,
} from './publish-article.use-case';

export interface PublishArticleAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  articleId: string;
}

/**
 * Único caminho HTTP que persiste `PUBLISHED`: sempre publica e, em
 * seguida, tenta revalidar o site público — nunca o inverso, e nunca um
 * sem o outro (Architecture.md §21). Cross-domain (Editorial + a porta de
 * Revalidação), por isso vive em `application`, não em `EditorialModule`.
 *
 * Falha de revalidação nunca desfaz a publicação já persistida: a
 * transação de `PublishArticleUseCase` já comitou antes desta chamada, e
 * o MVP não tem fila/outbox para retry (Architecture.md §21) — o único
 * efeito de uma falha aqui é um log estruturado; o resultado retornado ao
 * chamador continua sendo o sucesso da publicação.
 */
@Injectable()
export class PublishArticleAndRevalidateUseCase {
  private readonly logger = new Logger(PublishArticleAndRevalidateUseCase.name);

  constructor(
    private readonly publishArticleUseCase: PublishArticleUseCase,
    @Inject(REVALIDATION_PORT) private readonly revalidationPort: RevalidationPort,
  ) {}

  async execute(input: PublishArticleAndRevalidateInput): Promise<PublishArticleResult> {
    const result = await this.publishArticleUseCase.execute({
      siteId: input.siteId,
      articleId: input.articleId,
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
        'Falha ao revalidar cache após publicar Artigo.',
      );
    }

    return result;
  }
}
