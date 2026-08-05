import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import type { Article } from '../../../generated/prisma/client';

/**
 * Descobre quais Artigos publicados são afetados por uma mudança em
 * Categoria/Produto/Oferta/Autor (APP-005) — consulta pura, sem efeito
 * colateral, sem revalidação (isso é `REV-005`, Fase 14, que consome esta
 * classe a partir de lá). Sem controller, sem contrato próprio: nada
 * nesta tarefa menciona rota HTTP.
 *
 * Quatro métodos explícitos, espelhando os quatro novos métodos de
 * `PrismaArticleRepository` — não um `execute({ entityType, entityId })`
 * genérico com `switch`, mesmo critério já usado no projeto para preferir
 * operações nomeadas e type-safe a despacho genérico (EDT-010: "três
 * operações separadas, nunca combinadas"). Delegação fina, sem lógica
 * própria — cada consulta real (filtro por `siteId`/`status: PUBLISHED`,
 * travessia de relação) já vive no repository.
 */
@Injectable()
export class FindAffectedPublishedArticlesUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async findByCategory(siteId: string, categoryId: string): Promise<Article[]> {
    return this.articleRepository.findPublishedByCategory(siteId, categoryId);
  }

  async findByAuthor(siteId: string, authorId: string): Promise<Article[]> {
    return this.articleRepository.findPublishedByAuthor(siteId, authorId);
  }

  async findByProduct(siteId: string, productId: string): Promise<Article[]> {
    return this.articleRepository.findPublishedByProduct(siteId, productId);
  }

  async findByOffer(siteId: string, offerId: string): Promise<Article[]> {
    return this.articleRepository.findPublishedByOffer(siteId, offerId);
  }
}
