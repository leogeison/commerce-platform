import { Injectable } from '@nestjs/common';
import { DeleteProductUseCase } from '../../catalog/application/delete-product.use-case';
import { PrismaArticleProductRepository } from '../../editorial/infrastructure/prisma-article-product.repository';

export interface RemoveProductInput {
  siteId: string;
  productId: string;
}

export type RemoveProductResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'LINKED_TO_ARTICLE' }
  | { ok: false; reason: 'HAS_OFFERS' };

/**
 * Exclusão física de Produto (APP-003) — caso de uso cross-domain
 * completo, com endpoint HTTP real (`ArticleHealthController`'s sibling
 * neste módulo: `RemoveProductController`). Não existe mais um caso de
 * uso isolado `validate-product-deletion` (correção da revisão) — a
 * validação e a execução vivem juntas aqui.
 *
 * Pré-checa vínculo com Artigo (`PrismaArticleProductRepository.existsByProduct`,
 * qualquer status — regra geral do Architecture.md §12, não só Artigo
 * publicado) **antes** de chamar `DeleteProductUseCase` (CAT-014,
 * interno do Catalog). Exceção deliberada à convenção "reativo, sem
 * pré-checagem" usada no resto do projeto: `ArticleProduct.product` tem
 * `onDelete: Restrict`, e `CAT-014` já traduz **qualquer** `P2003` em
 * `HAS_OFFERS`, porque Catalog não conhece `ArticleProduct` (não pode
 * depender de Editorial) — sem a pré-checagem, um Produto vinculado só a
 * um Artigo (sem nenhuma Oferta) receberia o motivo errado.
 *
 * **Corrida coberta sem lock/transação cross-domain**: entre a
 * pré-checagem e a chamada a `CAT-014`, um vínculo novo com Artigo
 * poderia em tese ser criado (só possível com o Artigo em `DRAFT`). Se
 * `CAT-014` devolver `HAS_OFFERS`, reconsulta `existsByProduct` — se
 * agora houver vínculo, o motivo real era `ArticleProduct`, não Oferta,
 * e o resultado é corrigido para `LINKED_TO_ARTICLE`; caso contrário,
 * `HAS_OFFERS` é preservado como veio. Mantém Catalog independente de
 * Editorial (nenhuma mudança em `CAT-014`/`PrismaProductRepository`, que
 * seguem sem conhecer o nome da constraint de `ArticleProduct`).
 *
 * `NOT_FOUND` não precisa de checagem própria: se `productId` não
 * existir, `existsByProduct` só devolve `false` (nenhuma linha bate de
 * qualquer forma), e `CAT-014` já devolve `NOT_FOUND` corretamente (via
 * `P2025`, `PrismaProductRepository.deleteBySite`).
 *
 * Fora do escopo: arquivamento (passa pelos orquestradores de
 * revalidação `REV-011`, Fase 14, não é chamado diretamente daqui).
 */
@Injectable()
export class RemoveProductUseCase {
  constructor(
    private readonly articleProductRepository: PrismaArticleProductRepository,
    private readonly deleteProductUseCase: DeleteProductUseCase,
  ) {}

  async execute(input: RemoveProductInput): Promise<RemoveProductResult> {
    const linkedToArticle = await this.articleProductRepository.existsByProduct(
      input.siteId,
      input.productId,
    );

    if (linkedToArticle) {
      return { ok: false, reason: 'LINKED_TO_ARTICLE' };
    }

    const result = await this.deleteProductUseCase.execute({
      siteId: input.siteId,
      id: input.productId,
    });

    if (!result.ok && result.reason === 'HAS_OFFERS') {
      const linkedNow = await this.articleProductRepository.existsByProduct(
        input.siteId,
        input.productId,
      );

      if (linkedNow) {
        return { ok: false, reason: 'LINKED_TO_ARTICLE' };
      }
    }

    return result;
  }
}
