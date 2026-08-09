import { z } from 'zod';

/** `GET /public/sites/:siteSlug/articles` (PUB-002). */
export const publicArticlesSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type PublicArticlesSiteParams = z.infer<typeof publicArticlesSiteParamsSchema>;
