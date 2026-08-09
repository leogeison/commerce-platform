import { Injectable } from '@nestjs/common';
import {
  PrismaArticleRepository,
  type PublishedArticleWithProducts,
} from '../infrastructure/prisma-article.repository';

/**
 * Input próprio do caso de uso — não o `PublicArticleParams` do contrato
 * HTTP, mesmo raciocínio já aplicado em `GetArticleUseCase`/
 * `ListPublicArticlesUseCase`.
 */
export interface GetPublicArticleInput {
  siteId: string;
  slug: string;
}

/**
 * Caso de uso de detalhe público de Artigo por `slug` (PUB-003).
 *
 * Só delega ao repository e devolve `PublishedArticleWithProducts | null` —
 * mesmo critério de `GetArticleUseCase`: "não existe", "existe em outro
 * Site" e "existe mas não está `PUBLISHED`" chegam aqui como o mesmo
 * `null` (o repository já não distingue os três casos), satisfazendo o
 * critério de aceite da PUB-003 ("404 se não publicado, mesmo que o slug
 * exista em outro status"). Quem decide que `null` vira `404 Not Found` é
 * o controller (camada HTTP).
 */
@Injectable()
export class GetPublicArticleUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: GetPublicArticleInput): Promise<PublishedArticleWithProducts | null> {
    return this.articleRepository.findOnePublishedBySite(input.siteId, input.slug);
  }
}
