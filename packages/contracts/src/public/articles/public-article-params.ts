import { z } from 'zod';

/**
 * `GET /public/sites/:siteSlug/articles/:slug` (PUB-003) — `:slug`, nunca
 * `:id`: rota pública, sem exigir/expor identificador interno quando o
 * slug já é suficiente para localizar o recurso.
 */
export const publicArticleParamsSchema = z.object({
  siteSlug: z.string().min(1),
  slug: z.string().min(1),
});

export type PublicArticleParams = z.infer<typeof publicArticleParamsSchema>;
