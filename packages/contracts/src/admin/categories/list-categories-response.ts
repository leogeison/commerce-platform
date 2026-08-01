import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { categoryAdminSchema } from './category.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/categories` (CAT-002) —
 * envelope de paginação padrão (`common/paginated-response.ts`) em torno
 * de `categoryAdminSchema`, mesmo padrão já usado em toda a API.
 */
export const listCategoriesResponseSchema = paginatedResponseSchema(categoryAdminSchema);

export type ListCategoriesResponse = z.infer<typeof listCategoriesResponseSchema>;
