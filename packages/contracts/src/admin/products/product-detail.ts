import { z } from 'zod';
import { productAdminSchema } from './product.js';
import { productOfferSummarySchema } from './product-offer-summary.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/products/:id` (CAT-010:
 * "detalhar (inclui ofertas resumidas)"). Estende `productAdminSchema` com
 * `offers` — a única resposta de Produto que inclui ofertas; criar, listar
 * e arquivar/desarquivar usam `productAdminSchema` "raso".
 */
export const productDetailAdminSchema = productAdminSchema.extend({
  offers: z.array(productOfferSummarySchema),
});

export type ProductDetailAdmin = z.infer<typeof productDetailAdminSchema>;
