import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso (não o `ArticleParams` do contrato HTTP) —
 * mesmo raciocínio já aplicado em `GetAuthorUseCase`/`CreateArticleUseCase`.
 */
export interface GetArticleInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de detalhe de Artigo (EDT-008).
 *
 * Só delega ao repository e devolve `Article | null` — "não encontrado" e
 * "pertence a outro Site" chegam aqui como o mesmo `null` (o repository já
 * não distingue os dois casos, mesmo raciocínio de `GetAuthorUseCase`), e
 * o caso de uso não inventa uma distinção que não existe. Quem decide que
 * `null` vira `404 Not Found` é o controller (camada HTTP).
 */
@Injectable()
export class GetArticleUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: GetArticleInput): Promise<Article | null> {
    return this.articleRepository.findOneBySite(input.siteId, input.id);
  }
}
