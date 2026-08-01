import { z } from 'zod';

/**
 * Query string de `GET /admin/sites/:siteSlug/products` (CAT-009).
 *
 * `page`/`pageSize`/`archived`: mesma paginação e semântica já usadas em
 * `listCategoriesQuerySchema` (CTR-003/CAT-002) — decisão explícita da
 * CTR-004 de manter os dois contratos consistentes.
 *
 * `categoryId?`: filtro adicional, exclusivo de Produto (backlog, CAT-009:
 * "filtro categoryId?"). `z.string().uuid()`, opcional — sem filtro quando
 * ausente.
 *
 * Sem busca textual: o próprio backlog exclui isso explicitamente do
 * escopo da CAT-009 ("sem busca textual").
 */
export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  categoryId: z.string().uuid().optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
