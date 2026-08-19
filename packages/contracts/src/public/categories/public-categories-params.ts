import { z } from 'zod';

/** `GET /public/sites/:siteSlug/categories` (UXF-010). */
export const publicCategoriesSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type PublicCategoriesSiteParams = z.infer<typeof publicCategoriesSiteParamsSchema>;
