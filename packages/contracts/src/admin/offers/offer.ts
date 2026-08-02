import { z } from 'zod';
import { marketplaceSchema } from '../common/marketplace.js';
import { affiliateUrlSchema } from './affiliate-url.js';
import { offerPriceSchema } from './offer-price.js';

/**
 * Representação de `Offer` na superfície administrativa (CTR-005).
 * Reaproveitada como corpo de resposta de criar, listar (cada item) e
 * detalhar — mesmo padrão já usado em `categoryAdminSchema`/`productAdminSchema`.
 *
 * `id`, `siteId`, `productId`, `archivedAt`, `createdAt`, `updatedAt` são
 * sempre gerados/atribuídos pelo servidor — `siteId`/`productId` nunca vêm
 * do body (resolvidos via `TenantContext`/parâmetro de rota, mesmo
 * critério já usado em Categoria/Produto).
 *
 * `price`/`affiliateUrl` reaproveitam `offerPriceSchema`/`affiliateUrlSchema`
 * — mesma validação do request também vale na resposta, já que o valor
 * persistido é exatamente o que foi validado na criação.
 */
export const offerAdminSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  productId: z.string().uuid(),
  marketplace: marketplaceSchema,
  price: offerPriceSchema,
  currency: z.string().min(1),
  affiliateUrl: affiliateUrlSchema,
  inStock: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OfferAdmin = z.infer<typeof offerAdminSchema>;
