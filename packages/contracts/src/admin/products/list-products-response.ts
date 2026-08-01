import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { productAdminSchema } from './product.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/products` (CAT-009) —
 * envelope de paginação padrão em torno de `productAdminSchema`, mesmo
 * padrão de `listCategoriesResponseSchema` (CTR-003). Cada item é o
 * `productAdminSchema` "raso" (sem `offers`) — o resumo de ofertas só
 * aparece no detalhe (`productDetailAdminSchema`, CAT-010).
 */
export const listProductsResponseSchema = paginatedResponseSchema(productAdminSchema);

export type ListProductsResponse = z.infer<typeof listProductsResponseSchema>;
