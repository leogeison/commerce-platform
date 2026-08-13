import { Injectable } from '@nestjs/common';
import { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';

/**
 * Input próprio do caso de uso (não o `ArticleParams` do contrato HTTP) —
 * mesmo raciocínio já aplicado em `GetArticleUseCase`/`LinkArticleProductUseCase`.
 */
export interface GetArticleProductsInput {
  siteId: string;
  articleId: string;
}

/**
 * Caso de uso de leitura dos `productId`s vinculados a um Artigo (incremento
 * ADM-009, sobre `EDT-010`) — só delega a
 * `PrismaArticleProductRepository.findProductIdsByArticle`, já existente e
 * já usada por `APP-001` (`/health`): leitura pura, fora de transação, sem
 * lock, ordenada por `position`.
 *
 * Não distingue "Artigo não existe" de "existe e não tem Produtos
 * vinculados" — ambos os casos devolvem `[]` aqui, mesmo critério de
 * `GetArticleUseCase` não inventar uma distinção que o repository não faz.
 * A checagem de existência do Artigo (`404`) é responsabilidade do
 * controller, que já chama `GetArticleUseCase` para isso antes de chamar
 * este caso de uso.
 */
@Injectable()
export class GetArticleProductsUseCase {
  constructor(private readonly articleProductRepository: PrismaArticleProductRepository) {}

  async execute(input: GetArticleProductsInput): Promise<string[]> {
    return this.articleProductRepository.findProductIdsByArticle(input.siteId, input.articleId);
  }
}
