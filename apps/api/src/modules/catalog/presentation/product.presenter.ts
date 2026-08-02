import type { ProductAdmin, ProductDetailAdmin } from '@commerce-platform/contracts';
import type { Product } from '../../../generated/prisma/client';
import type { ProductWithOfferSummaries } from '../infrastructure/prisma-product.repository';

/**
 * Converte um `Product` (Prisma) para o formato HTTP `ProductAdmin`
 * (CTR-004). Mesmo raciocínio de `category.presenter.ts` (CAT-001):
 * conversão de `Date` → string ISO pertence à apresentação/contrato, não
 * ao caso de uso nem ao repository.
 */
export function toProductAdmin(product: Product): ProductAdmin {
  return {
    id: product.id,
    siteId: product.siteId,
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    archivedAt: product.archivedAt ? product.archivedAt.toISOString() : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

/**
 * Converte um `Product` com resumo de ofertas (`ProductWithOfferSummaries`,
 * `PrismaProductRepository.findOneBySiteWithOffers`) para o formato HTTP
 * `ProductDetailAdmin` (CTR-004; CAT-010). Reaproveita os mesmos campos de
 * `toProductAdmin` — só acrescenta `offers`.
 *
 * `price` (`Decimal` do Prisma) vira `string` via `.toFixed(2)` — nunca
 * `number`, mesma decisão da CTR-004 (evita perda de precisão em valor
 * monetário). `toFixed(2)` em vez de `toString()`: o banco é
 * `Decimal(10,2)`, então a saída sempre tem exatamente duas casas
 * decimais, mesmo padrão de `offer.presenter.ts` (decisão explícita,
 * revisão da CAT-015, para não haver serialização diferente entre criação
 * e detalhe).
 */
export function toProductDetailAdmin(
  product: ProductWithOfferSummaries,
): ProductDetailAdmin {
  return {
    ...toProductAdmin(product),
    offers: product.offers.map((offer) => ({
      id: offer.id,
      marketplace: offer.marketplace,
      price: offer.price.toFixed(2),
      currency: offer.currency,
      inStock: offer.inStock,
      archivedAt: offer.archivedAt ? offer.archivedAt.toISOString() : null,
    })),
  };
}
