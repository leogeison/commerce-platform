import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { offerAdminSchema } from './offer.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/products/:productId/offers`
 * (CAT-016) — envelope de paginação padrão em torno de `offerAdminSchema`,
 * mesmo padrão de `listCategoriesResponseSchema`/`listProductsResponseSchema`.
 */
export const listOffersResponseSchema = paginatedResponseSchema(offerAdminSchema);

export type ListOffersResponse = z.infer<typeof listOffersResponseSchema>;
