import { z } from 'zod';

/**
 * Parâmetros de rota das superfícies de Produto (CTR-004) — mesmo padrão
 * de `category-params.ts` (CTR-003): o contrato representa todos os
 * parâmetros da URL, não só o corpo/query.
 *
 * `siteSlug` só `z.string().min(1)`, mesmo motivo já usado em Categoria:
 * nenhuma política de formato documentada ainda.
 */

/** `POST /admin/sites/:siteSlug/products`, `GET /admin/sites/:siteSlug/products` */
export const productsSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type ProductsSiteParams = z.infer<typeof productsSiteParamsSchema>;

/**
 * `GET /admin/sites/:siteSlug/products/:id`,
 * `POST /admin/sites/:siteSlug/products/:id/archive`,
 * `POST /admin/sites/:siteSlug/products/:id/unarchive`
 *
 * Sem contrato de parâmetros para CAT-011 (atualizar) / CAT-014 (excluir)
 * — mesma decisão já tomada para `CAT-004`/`CAT-007` na CTR-003: operações
 * internas, sem rota HTTP direta.
 */
export const productParamsSchema = z.object({
  siteSlug: z.string().min(1),
  id: z.string().uuid(),
});

export type ProductParams = z.infer<typeof productParamsSchema>;
