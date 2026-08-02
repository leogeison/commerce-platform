import type { OfferAdmin } from '@commerce-platform/contracts';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Converte um `Offer` (Prisma) para o formato HTTP `OfferAdmin` (CTR-005).
 * Mesmo raciocínio de `category.presenter.ts`/`product.presenter.ts`:
 * conversão de `Date` → string ISO e `Decimal` → string pertence à
 * apresentação/contrato, não ao caso de uso nem ao repository.
 *
 * `price.toFixed(2)`: nunca `number` — mesma decisão já usada em
 * `toProductDetailAdmin` (evita perda de precisão em valor monetário).
 * `toFixed(2)` em vez de `toString()`: o banco é `Decimal(10,2)`, então a
 * saída sempre tem exatamente duas casas decimais, independentemente de
 * zeros à direita terem sido informados na criação — resposta previsível
 * e consistente entre criação e detalhe (decisão explícita, revisão da
 * CAT-015).
 */
export function toOfferAdmin(offer: Offer): OfferAdmin {
  return {
    id: offer.id,
    siteId: offer.siteId,
    productId: offer.productId,
    marketplace: offer.marketplace,
    price: offer.price.toFixed(2),
    currency: offer.currency,
    affiliateUrl: offer.affiliateUrl,
    inStock: offer.inStock,
    archivedAt: offer.archivedAt ? offer.archivedAt.toISOString() : null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}
