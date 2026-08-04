import { z } from 'zod';
import { articleParamsSchema } from './article-params.js';

/**
 * Parâmetros de rota da superfície `ArticleProduct` (EDT-010) — vínculo
 * entre Artigo e Produto.
 *
 * `POST /admin/sites/:siteSlug/articles/:id/products` (vincular) e `PATCH
 * /admin/sites/:siteSlug/articles/:id/products/reorder` (reordenar)
 * reaproveitam `articleParamsSchema` (`{siteSlug, id}`, `id` = articleId) —
 * nenhuma das duas rotas tem `productId` na URL.
 */

/**
 * `DELETE /admin/sites/:siteSlug/articles/:id/products/:productId`
 * (desvincular) — única rota da superfície com `productId` na URL, por
 * isso estende `articleParamsSchema` em vez de reaproveitá-lo puro.
 */
export const articleProductParamsSchema = articleParamsSchema.extend({
  productId: z.string().uuid(),
});

export type ArticleProductParams = z.infer<typeof articleProductParamsSchema>;
