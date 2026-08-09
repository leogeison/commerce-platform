import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { publicArticleSummarySchema } from './public-article-summary.js';

/**
 * Corpo de resposta de `GET /public/sites/:siteSlug/articles` (PUB-002) —
 * envelope de paginação padrão (`common/paginated-response.ts`) em torno
 * de `publicArticleSummarySchema`, mesmo padrão já usado em toda a API.
 */
export const listPublicArticlesResponseSchema = paginatedResponseSchema(
  publicArticleSummarySchema,
);

export type ListPublicArticlesResponse = z.infer<typeof listPublicArticlesResponseSchema>;
