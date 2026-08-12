import { z } from 'zod';
import { affiliateUrlSchema } from '../../common/affiliate-url.js';
import { marketplaceSchema } from '../../common/marketplace.js';
import { offerPriceSchema } from './offer-price.js';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/products/:productId/offers/:id`.
 *
 * Todos os campos `.optional()`, nenhum `.nullable()` — diferente de
 * `updateCategoryRequestSchema`/`updateProductRequestSchema`, nenhuma
 * coluna de `Offer` é nulável no schema Prisma (`marketplace`, `price`,
 * `currency`, `affiliateUrl`, `inStock` são todos obrigatórios, alguns com
 * `@default`), então não existe semântica tri-state a representar aqui:
 * campo ausente (`undefined`) não é tocado; campo presente sempre recebe um
 * valor válido, nunca `null`.
 *
 * `productId` não faz parte deste contrato — é identidade da rota
 * (parâmetro, não corpo), nunca atualizável.
 */
export const updateOfferRequestSchema = z.object({
  marketplace: marketplaceSchema.optional(),
  price: offerPriceSchema.optional(),
  currency: z.string().min(1).optional(),
  affiliateUrl: affiliateUrlSchema.optional(),
  inStock: z.boolean().optional(),
});

export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;
