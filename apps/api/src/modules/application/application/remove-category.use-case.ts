import { Injectable } from '@nestjs/common';
import { DeleteCategoryUseCase } from '../../catalog/application/delete-category.use-case';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';

export interface RemoveCategoryInput {
  siteId: string;
  categoryId: string;
}

export type RemoveCategoryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'LINKED_TO_ARTICLE' }
  | { ok: false; reason: 'HAS_PRODUCTS' };

/**
 * Exclusão física de Categoria (APP-006) — caso de uso cross-domain
 * completo, com endpoint HTTP real (`RemoveCategoryController`, mesmo
 * módulo). Mesmos moldes exatos de `RemoveProductUseCase` (APP-003),
 * trocando Produto/Oferta por Categoria/Produto.
 *
 * Pré-checa vínculo com Artigo (`PrismaArticleRepository.existsByCategory`,
 * qualquer status — regra geral do Architecture.md §12, não só Artigo
 * publicado) **antes** de chamar `DeleteCategoryUseCase` (CAT-007,
 * interno do Catalog). Mesma exceção deliberada à convenção "reativo, sem
 * pré-checagem": `Article.category` não tem `onDelete: Restrict` mapeado
 * em Catalog (Catalog não conhece Artigo), e `CAT-007` já traduz
 * **qualquer** `P2003` em `HAS_PRODUCTS`, porque só conhece a FK de
 * `Product.category` — sem a pré-checagem, uma Categoria vinculada só a
 * um Artigo (sem nenhum Produto) receberia o motivo errado (ou nenhum, já
 * que Catalog nem teria uma constraint para disparar).
 *
 * **Corrida coberta sem lock/transação cross-domain**: entre a
 * pré-checagem e a chamada a `CAT-007`, um vínculo novo com Artigo
 * poderia em tese ser criado. Se `CAT-007` devolver `HAS_PRODUCTS`,
 * reconsulta `existsByCategory` — se agora houver vínculo, o resultado é
 * corrigido para `LINKED_TO_ARTICLE`; caso contrário, `HAS_PRODUCTS` é
 * preservado como veio. Mantém Catalog independente de Editorial (nenhuma
 * mudança em `CAT-007`/`PrismaCategoryRepository`).
 *
 * `NOT_FOUND` não precisa de checagem própria: se `categoryId` não
 * existir, `existsByCategory` só devolve `false` de qualquer forma, e
 * `CAT-007` já devolve `NOT_FOUND` corretamente (via `P2025`,
 * `PrismaCategoryRepository.deleteBySite`).
 */
@Injectable()
export class RemoveCategoryUseCase {
  constructor(
    private readonly articleRepository: PrismaArticleRepository,
    private readonly deleteCategoryUseCase: DeleteCategoryUseCase,
  ) {}

  async execute(input: RemoveCategoryInput): Promise<RemoveCategoryResult> {
    const linkedToArticle = await this.articleRepository.existsByCategory(
      input.siteId,
      input.categoryId,
    );

    if (linkedToArticle) {
      return { ok: false, reason: 'LINKED_TO_ARTICLE' };
    }

    const result = await this.deleteCategoryUseCase.execute({
      siteId: input.siteId,
      id: input.categoryId,
    });

    if (!result.ok && result.reason === 'HAS_PRODUCTS') {
      const linkedNow = await this.articleRepository.existsByCategory(
        input.siteId,
        input.categoryId,
      );

      if (linkedNow) {
        return { ok: false, reason: 'LINKED_TO_ARTICLE' };
      }
    }

    return result;
  }
}
