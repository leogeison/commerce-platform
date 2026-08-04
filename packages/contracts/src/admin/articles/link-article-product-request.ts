import { z } from 'zod';

/**
 * Corpo de `POST /admin/sites/:siteSlug/articles/:id/products` (`EDT-010`,
 * vincular Produto ao Artigo).
 *
 * Só `productId` — a posição é sempre calculada pelo servidor (decisão
 * explícita desta tarefa: o Produto vinculado sempre entra no fim da
 * lista), o cliente nunca informa `position` no vínculo. Reordenar é uma
 * operação separada (`reorder-article-products-request.ts`).
 */
export const linkArticleProductRequestSchema = z.object({
  productId: z.string().uuid(),
});

export type LinkArticleProductRequest = z.infer<typeof linkArticleProductRequestSchema>;
