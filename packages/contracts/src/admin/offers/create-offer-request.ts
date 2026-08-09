import { z } from 'zod';
import { affiliateUrlSchema } from '../../common/affiliate-url.js';
import { marketplaceSchema } from '../../common/marketplace.js';
import { offerPriceSchema } from './offer-price.js';

/**
 * Corpo de `POST /admin/sites/:siteSlug/products/:productId/offers`
 * (CAT-015).
 *
 * `currency`/`inStock` opcionais: o schema Prisma já tem defaults
 * (`currency @default("BRL")`, `inStock @default(true)`) — o contrato não
 * duplica esses valores, quem aplica é o backend (repository/caso de uso)
 * quando o campo vier ausente.
 */
export const createOfferRequestSchema = z.object({
  marketplace: marketplaceSchema,
  price: offerPriceSchema,
  currency: z.string().min(1).optional(),
  affiliateUrl: affiliateUrlSchema,
  inStock: z.boolean().optional(),
});

export type CreateOfferRequest = z.infer<typeof createOfferRequestSchema>;
