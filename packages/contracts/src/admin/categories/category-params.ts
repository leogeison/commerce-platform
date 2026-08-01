import { z } from 'zod';

/**
 * Parâmetros de rota das superfícies de Categoria (CTR-003) — o contrato
 * representa todos os parâmetros da URL, não só o corpo/query.
 *
 * `siteSlug` só `z.string().min(1)`, mesmo motivo do `slug` de Categoria:
 * nenhuma política de formato documentada ainda.
 */

/** `POST /admin/sites/:siteSlug/categories`, `GET /admin/sites/:siteSlug/categories` */
export const categoriesSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type CategoriesSiteParams = z.infer<typeof categoriesSiteParamsSchema>;

/**
 * `GET /admin/sites/:siteSlug/categories/:id`,
 * `POST /admin/sites/:siteSlug/categories/:id/archive`,
 * `POST /admin/sites/:siteSlug/categories/:id/unarchive`
 */
export const categoryParamsSchema = z.object({
  siteSlug: z.string().min(1),
  id: z.string().uuid(),
});

export type CategoryParams = z.infer<typeof categoryParamsSchema>;
