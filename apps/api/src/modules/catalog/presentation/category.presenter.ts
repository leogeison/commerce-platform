import type { CategoryAdmin } from '@commerce-platform/contracts';
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
