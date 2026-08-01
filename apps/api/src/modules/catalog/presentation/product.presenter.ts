import type { ProductAdmin } from '@commerce-platform/contracts';
import type { Product } from '../../../generated/prisma/client';

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
