import { z } from 'zod';

/**
 * Parâmetros de rota de `GET /r/:siteSlug/:offerId` (TRK-002; Architecture.md,
 * Seção 20 — Fluxo de Tracking). Primeiro contrato da superfície `tracking`
 * (CTR-011).
 *
 * `siteSlug` só `z.string().min(1)`, mesmo critério já usado em todo o
 * projeto (Categoria/Produto/Oferta/Autor/Artigo): nenhuma política de
 * formato documentada ainda.
 *
 * `offerId` — mesmo padrão de todo `id` de rota no projeto
 * (`z.string().uuid()`): `Offer.id` é `@default(uuid())` no schema Prisma.
 */
export const affiliateRedirectParamsSchema = z.object({
  siteSlug: z.string().min(1),
  offerId: z.string().uuid(),
});

export type AffiliateRedirectParams = z.infer<typeof affiliateRedirectParamsSchema>;
