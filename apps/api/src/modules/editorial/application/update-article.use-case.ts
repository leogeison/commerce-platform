import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { Article, ArticleType } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — espelha `UpdateArticleRequest` (contrato
 * HTTP) campo a campo, mesmo raciocínio já aplicado em
 * `CreateArticleUseCase`: o caso de uso não deve depender do tipo da
 * camada de transporte. Os quatro campos tri-state (`string | null |
 * undefined`) preservam exatamente a mesma semântica do contrato —
 * `undefined` = não mexer, `null` = limpar, valor = definir.
 */
export interface UpdateArticleInput {
  siteId: string;
  id: string;
  type?: ArticleType;
  title?: string;
  slug?: string;
  categoryId?: string | null;
  authorId?: string | null;
  metaDescription?: string | null;
  coverImageUrl?: string | null;
  bodyMdx?: string;
}

export type UpdateArticleResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' }
  | { ok: false; reason: 'AUTHOR_NOT_FOUND' };

/**
 * Caso de uso de atualização de Artigo (EDT-009).
 *
 * Só delega ao repository, mesmo padrão de `CreateArticleUseCase` —
 * nenhuma regra de negócio adicional documentada além do que
 * `updateArticleRequestSchema` (CTR-007) já exige na forma. A restrição
 * "só em `DRAFT`" e a tradução de `P2002`/`P2003` já acontecem em
 * `PrismaArticleRepository.updateBySite` antes de chegar aqui.
 */
@Injectable()
export class UpdateArticleUseCase {
  constructor(private readonly articleRepository: PrismaArticleRepository) {}

  async execute(input: UpdateArticleInput): Promise<UpdateArticleResult> {
    return this.articleRepository.updateBySite(input);
  }
}
