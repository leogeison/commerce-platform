import { z } from 'zod';

/**
 * Parâmetros de rota das superfícies de Artigo (CTR-007) — mesmo padrão
 * de `category-params.ts`/`author-params.ts`: o contrato representa todos
 * os parâmetros da URL, não só o corpo/query.
 */

/** `POST /admin/sites/:siteSlug/articles`, `GET /admin/sites/:siteSlug/articles` */
export const articlesSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type ArticlesSiteParams = z.infer<typeof articlesSiteParamsSchema>;

/**
 * `GET /admin/sites/:siteSlug/articles/:id` (`EDT-008`), `PATCH
 * /admin/sites/:siteSlug/articles/:id` (`EDT-009`) — entregue já na
 * CTR-007 mesmo sem uso ainda em `EDT-006` (mesma antecipação de
 * contrato já feita em `category-params.ts`/`author-params.ts`).
 */
export const articleParamsSchema = z.object({
  siteSlug: z.string().min(1),
  id: z.string().uuid(),
});

export type ArticleParams = z.infer<typeof articleParamsSchema>;
