import type { ArticleHealthResponse } from '@commerce-platform/contracts';
import type { ArticleHealth } from '../application/calculate-article-health.use-case';

/**
 * Converte o `ArticleHealth` (interno, `CalculateArticleHealthUseCase`)
 * para o formato HTTP `ArticleHealthResponse` (APP-001) — mapeamento 1:1
 * hoje, mas mantido como presenter explícito, mesmo critério do resto do
 * projeto (`toArticleAdmin` etc.): a camada `application`/`domain` nunca
 * importa tipos de `packages/contracts` para sua própria saída, quem
 * traduz é sempre a `presentation`.
 */
export function toArticleHealthResponse(health: ArticleHealth): ArticleHealthResponse {
  return {
    categoryActive: health.categoryActive,
    hasAtLeastOneProduct: health.hasAtLeastOneProduct,
    allProductsHaveValidOffer: health.allProductsHaveValidOffer,
    invalidProducts: health.invalidProducts,
    slugUnique: health.slugUnique,
    metaDescriptionFilled: health.metaDescriptionFilled,
    coverImagePresent: health.coverImagePresent,
    healthy: health.healthy,
  };
}
