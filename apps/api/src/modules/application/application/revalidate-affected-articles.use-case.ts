import { Inject, Injectable, Logger } from '@nestjs/common';
import { REVALIDATION_PORT, type RevalidationPort } from '../../revalidation/domain/revalidation.port';
import { FindAffectedPublishedArticlesUseCase } from './find-affected-published-articles.use-case';
import type { Article } from '../../../generated/prisma/client';

type AffectedArticlesResource = 'category' | 'author' | 'product' | 'offer';

interface AffectedArticlesOrigin {
  siteId: string;
  resource: AffectedArticlesResource;
  resourceId: string;
}

export interface RevalidateForCategoryInput {
  siteId: string;
  siteSlug: string;
  categoryId: string;
}

export interface RevalidateForAuthorInput {
  siteId: string;
  siteSlug: string;
  authorId: string;
}

export interface RevalidateForProductInput {
  siteId: string;
  siteSlug: string;
  productId: string;
}

export interface RevalidateForOfferInput {
  siteId: string;
  siteSlug: string;
  offerId: string;
}

/**
 * Mecanismo de coordenação reutilizável consumido pelos futuros
 * orquestradores HTTP-facing de Categoria/Produto/Oferta/Autor: dado que a
 * entidade já mudou — e a mudança já foi persistida por quem chama, antes
 * de qualquer um destes quatro métodos rodar —, descobre quais Artigos
 * publicados são afetados (delegando inteiramente a
 * `FindAffectedPublishedArticlesUseCase`) e tenta revalidar cada um
 * (delegando ao `RevalidationPort`).
 *
 * Como a mudança de origem já está persistida no momento em que qualquer
 * método aqui roda, nenhuma falha — nem na descoberta, nem numa tentativa
 * de revalidação — pode propagar como exceção: propagar faria o cliente
 * HTTP receber erro apesar de a mutação já ter ocorrido, arriscando retry
 * de uma operação já concluída. Os quatro métodos públicos sempre resolvem
 * `Promise<void>`; toda falha é capturada e logada, nunca relançada.
 *
 * Falha de descoberta e falha de revalidação são logadas de formas
 * diferentes: uma falha de descoberta nunca chega a saber quais Artigos
 * seriam afetados (não é uma lista vazia conhecida — é desconhecida), então
 * seu log não inclui `affectedArticleIds`; nesse caso, nenhuma tentativa de
 * revalidação é feita. Uma falha de revalidação já tem o Artigo em mãos, e
 * é logada individualmente por Artigo, sem interromper os demais.
 */
@Injectable()
export class RevalidateAffectedArticlesUseCase {
  private readonly logger = new Logger(RevalidateAffectedArticlesUseCase.name);

  constructor(
    private readonly findAffectedPublishedArticlesUseCase: FindAffectedPublishedArticlesUseCase,
    @Inject(REVALIDATION_PORT) private readonly revalidationPort: RevalidationPort,
  ) {}

  async revalidateForCategory(input: RevalidateForCategoryInput): Promise<void> {
    const origin: AffectedArticlesOrigin = {
      siteId: input.siteId,
      resource: 'category',
      resourceId: input.categoryId,
    };

    const articles = await this.discover(
      () => this.findAffectedPublishedArticlesUseCase.findByCategory(input.siteId, input.categoryId),
      origin,
    );

    if (!articles) {
      return;
    }

    await this.revalidateEach(articles, input.siteSlug, origin);
  }

  async revalidateForAuthor(input: RevalidateForAuthorInput): Promise<void> {
    const origin: AffectedArticlesOrigin = {
      siteId: input.siteId,
      resource: 'author',
      resourceId: input.authorId,
    };

    const articles = await this.discover(
      () => this.findAffectedPublishedArticlesUseCase.findByAuthor(input.siteId, input.authorId),
      origin,
    );

    if (!articles) {
      return;
    }

    await this.revalidateEach(articles, input.siteSlug, origin);
  }

  async revalidateForProduct(input: RevalidateForProductInput): Promise<void> {
    const origin: AffectedArticlesOrigin = {
      siteId: input.siteId,
      resource: 'product',
      resourceId: input.productId,
    };

    const articles = await this.discover(
      () => this.findAffectedPublishedArticlesUseCase.findByProduct(input.siteId, input.productId),
      origin,
    );

    if (!articles) {
      return;
    }

    await this.revalidateEach(articles, input.siteSlug, origin);
  }

  async revalidateForOffer(input: RevalidateForOfferInput): Promise<void> {
    const origin: AffectedArticlesOrigin = {
      siteId: input.siteId,
      resource: 'offer',
      resourceId: input.offerId,
    };

    const articles = await this.discover(
      () => this.findAffectedPublishedArticlesUseCase.findByOffer(input.siteId, input.offerId),
      origin,
    );

    if (!articles) {
      return;
    }

    await this.revalidateEach(articles, input.siteSlug, origin);
  }

  /**
   * Executa a descoberta (`APP-005`) protegida por `try/catch`. Sucesso
   * devolve o array de Artigos (podendo ser `[]` — "não há afetados",
   * conhecido). Falha loga e devolve `undefined` — "desconhecido", nunca
   * representado como `[]` — e é o sinal para os métodos públicos pararem
   * ali, sem tentar nenhuma revalidação.
   */
  private async discover(
    find: () => Promise<Article[]>,
    origin: AffectedArticlesOrigin,
  ): Promise<Article[] | undefined> {
    try {
      return await find();
    } catch (error) {
      this.logger.error(
        {
          siteId: origin.siteId,
          resource: origin.resource,
          resourceId: origin.resourceId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Falha ao descobrir Artigos publicados afetados para revalidação.',
      );

      return undefined;
    }
  }

  /**
   * Tenta `RevalidationPort.revalidate` uma vez por Artigo, sequencialmente
   * (`for...of` + `await`, sem `Promise.all`/`allSettled`). Cada tentativa
   * tem seu próprio `try/catch`: uma falha isolada é logada com o Artigo
   * específico que falhou (`affectedArticleIds: [article.id]`) e nunca
   * impede a tentativa dos demais.
   */
  private async revalidateEach(
    articles: Article[],
    siteSlug: string,
    origin: AffectedArticlesOrigin,
  ): Promise<void> {
    for (const article of articles) {
      try {
        await this.revalidationPort.revalidate({
          siteSlug,
          articleSlug: article.slug,
        });
      } catch (error) {
        this.logger.error(
          {
            siteId: origin.siteId,
            resource: origin.resource,
            resourceId: origin.resourceId,
            affectedArticleIds: [article.id],
            error: error instanceof Error ? error.message : String(error),
          },
          'Falha ao revalidar cache após alteração em dependência do Artigo.',
        );
      }
    }
  }
}
