import { z } from 'zod';
import { marketplaceSchema } from '../../common/marketplace.js';

/**
 * Representação pública de `Offer`, embutida em `publicArticleProductSchema`
 * (PUB-001/CTR-010; Architecture.md, Seção 31). Não é o contrato completo
 * administrativo (`admin/offers/offer.ts`) — só os campos necessários para
 * a página pública do Artigo montar o link de afiliado.
 *
 * `id` presente de propósito: é o dado que `WEB-009` (Fase 12) precisa para
 * montar `GET /r/:siteSlug/:offerId` — o FastCompre só conhece o `offerId`,
 * nunca a `affiliateUrl` real (essa continua exclusiva do fluxo de
 * Tracking, carregada do banco só no momento do redirect, TRK-005).
 *
 * **Nunca** inclui `affiliateUrl` — decisão explícita, não uma omissão a
 * ser corrigida depois.
 *
 * Sem `archivedAt`: diferente do admin (que expõe cru), aqui a filtragem
 * de Ofertas arquivadas/inválidas é responsabilidade da implementação da
 * PUB-003 — a Oferta simplesmente não aparece no array `offers`, mesmo
 * critério já usado para `Article.status` (nunca exposto cru; um Artigo
 * não publicado simplesmente não existe para a API pública).
 *
 * `price` como `z.string()`, nunca `number` — mesmo critério do admin
 * (`Offer.price` é `Decimal` no Postgres; `Decimal` → `number` do JS teria
 * risco de perda de precisão em valor monetário).
 */
export const publicOfferSchema = z.object({
  id: z.string().uuid(),
  marketplace: marketplaceSchema,
  price: z.string(),
  currency: z.string().min(1),
  inStock: z.boolean(),
});

export type PublicOffer = z.infer<typeof publicOfferSchema>;
