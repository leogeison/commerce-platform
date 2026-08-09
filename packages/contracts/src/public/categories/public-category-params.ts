import { z } from 'zod';

/**
 * `GET /public/sites/:siteSlug/categories/:slug` (PUB-004) — `:slug`,
 * nunca `:id`, mesmo critério de `public-article-params.ts`.
 */
export const publicCategoryParamsSchema = z.object({
  siteSlug: z.string().min(1),
  slug: z.string().min(1),
});

export type PublicCategoryParams = z.infer<typeof publicCategoryParamsSchema>;
