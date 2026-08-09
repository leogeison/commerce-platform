import { z } from 'zod';
import { marketplaceSchema } from '../../common/marketplace.js';

/**
 * Resumo de `Offer` embutido no detalhe de Produto (CAT-010: "detalhar
 * (inclui ofertas resumidas)"). **Não** é o contrato completo de Oferta —
 * esse é o escopo da futura CTR-005 (`admin/offers`), que ainda não
 * existe. Este schema só cobre os campos do schema Prisma de `Offer`
 * necessários para um resumo, sem inventar nada além do que está lá:
 * `id`, `marketplace`, `price`, `currency`, `inStock`, `archivedAt`.
 *
 * `marketplace` reaproveita `marketplaceSchema` de `common/` (PUB-001
 * moveu para lá, já que `public/articles` também passou a precisar do
 * mesmo enum) — não duplica.
 *
 * `price` como `z.string()`, nunca `number` — `Offer.price` é `Decimal`
 * no Postgres (`@db.Decimal(10, 2)`), e `Decimal` do Prisma não deve virar
 * `number` do JS por risco de perda de precisão em valores monetários
 * (mesmo critério já decidido para a CTR-004 como um todo).
 *
 * `currency` como `z.string().min(1)` — schema Prisma tem um `@default("BRL")`,
 * mas nenhuma lista fechada de moedas está documentada; não inventar um
 * enum aqui.
 */
export const productOfferSummarySchema = z.object({
  id: z.string().uuid(),
  marketplace: marketplaceSchema,
  price: z.string(),
  currency: z.string().min(1),
  inStock: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
});

export type ProductOfferSummary = z.infer<typeof productOfferSummarySchema>;
