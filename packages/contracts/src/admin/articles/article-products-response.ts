import { z } from 'zod';

/**
 * Corpo de resposta dos três endpoints de `ArticleProduct` (`EDT-010`):
 * vincular, desvincular e reordenar. Mesmo formato nos três — a coleção
 * completa e atual de `productId`s vinculados ao Artigo, já ordenada por
 * `position` — decisão explícita desta tarefa: devolver o estado
 * canônico depois de qualquer uma das três ações, evitando uma segunda
 * chamada do cliente. Simétrico ao request de reordenar
 * (`reorder-article-products-request.ts`).
 */
export const articleProductsResponseSchema = z.object({
  productIds: z.array(z.string().uuid()),
});

export type ArticleProductsResponse = z.infer<typeof articleProductsResponseSchema>;
