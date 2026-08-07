import { z } from 'zod';

/**
 * Parâmetros de rota das superfícies de Oferta (CTR-005) — mesmo padrão
 * de `product-params.ts` (CTR-004): o contrato representa todos os
 * parâmetros da URL, não só o corpo/query. Oferta é aninhada em Produto
 * (Architecture.md: "Ofertas ficam fora do Produto de propósito... uma
 * Oferta não é navegável por si só"), então toda rota carrega `productId`
 * além de `siteSlug`.
 *
 * `siteSlug` só `z.string().min(1)`, mesmo motivo já usado em
 * Categoria/Produto: nenhuma política de formato documentada ainda.
 */

/**
 * `POST /admin/sites/:siteSlug/products/:productId/offers`,
 * `GET /admin/sites/:siteSlug/products/:productId/offers`
 */
export const offersProductParamsSchema = z.object({
  siteSlug: z.string().min(1),
  productId: z.string().uuid(),
});

export type OffersProductParams = z.infer<typeof offersProductParamsSchema>;

/**
 * `GET /admin/sites/:siteSlug/products/:productId/offers/:id` e
 * `DELETE /admin/sites/:siteSlug/products/:productId/offers/:id`
 * (`RemoveOfferController`, TRK-010 — reaproveita este mesmo contrato, sem
 * nenhum campo novo).
 *
 * `CAT-018`/`CAT-019`/`CAT-020` (atualizar, arquivar, desarquivar)
 * continuam sem contrato de parâmetros próprio — mesma decisão já tomada
 * para `CAT-011` a `CAT-013` na CTR-004: operações internas, sem rota HTTP
 * direta ainda (endpoint real é `REV-013`, Fase 14, não implementado).
 */
export const offerParamsSchema = z.object({
  siteSlug: z.string().min(1),
  productId: z.string().uuid(),
  id: z.string().uuid(),
});

export type OfferParams = z.infer<typeof offerParamsSchema>;
