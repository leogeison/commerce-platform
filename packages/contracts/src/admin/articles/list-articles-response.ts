import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { articleSummaryAdminSchema } from './article-summary.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/articles` (`EDT-007`) —
 * envelope de paginação padrão em torno de `articleSummaryAdminSchema`
 * (sem `bodyMdx`, ver `article-summary.ts`), não `articleAdminSchema`
 * completo.
 */
export const listArticlesResponseSchema = paginatedResponseSchema(articleSummaryAdminSchema);

export type ListArticlesResponse = z.infer<typeof listArticlesResponseSchema>;
