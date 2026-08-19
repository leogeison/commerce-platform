import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { publicCategorySchema } from './public-category.js';

/**
 * Corpo de resposta de `GET /public/sites/:siteSlug/categories` (UXF-010) —
 * envelope de paginação padrão (`common/paginated-response.ts`) em torno de
 * `publicCategorySchema`, o mesmo schema de item já usado pela PUB-004
 * (`GET /public/sites/:siteSlug/categories/:slug`) — mesmo padrão de
 * `listPublicArticlesResponseSchema` reaproveitando o schema de item da
 * PUB-003.
 */
export const listPublicCategoriesResponseSchema = paginatedResponseSchema(
  publicCategorySchema,
);

export type ListPublicCategoriesResponse = z.infer<typeof listPublicCategoriesResponseSchema>;
