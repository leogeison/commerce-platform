import type { CategoryAdmin, PublicCategory } from '@commerce-platform/contracts';
import type { Category } from '../../../generated/prisma/client';

/**
 * Converte um `Category` (Prisma) para o formato HTTP `CategoryAdmin`
 * (CTR-003). Conversão de `Date` → string ISO pertence à
 * apresentação/contrato, não ao caso de uso nem ao repository — decisão
 * explícita da CAT-001, mesmo raciocínio de por que `category.presenter.ts`
 * é o único lugar que sabe que a resposta HTTP usa strings, não `Date`.
 */
export function toCategoryAdmin(category: Category): CategoryAdmin {
  return {
    id: category.id,
    siteId: category.siteId,
    name: category.name,
    slug: category.slug,
    archivedAt: category.archivedAt ? category.archivedAt.toISOString() : null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/**
 * Converte um `Category` (Prisma) para o formato HTTP público
 * `PublicCategory` (PUB-004) — só `name`/`slug`, decisão explícita da
 * CTR-010 (ver `public-category.ts`). Sem `archivedAt`: arquivamento não é
 * exposto nem usado para decidir visibilidade aqui — quem decide se a
 * Categoria existe é `GetPublicCategoryUseCase`/`findOneBySlug` (`null` →
 * `404`), nunca este presenter.
 */
export function toPublicCategory(category: Category): PublicCategory {
  return {
    name: category.name,
    slug: category.slug,
  };
}
