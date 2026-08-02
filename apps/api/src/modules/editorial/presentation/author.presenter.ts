import type { AuthorAdmin } from '@commerce-platform/contracts';
import type { Author } from '../../../generated/prisma/client';

/**
 * Converte um `Author` (Prisma) para o formato HTTP `AuthorAdmin`
 * (CTR-006). Sem conversão de `Date`, diferente de `toCategoryAdmin`/
 * `toProductAdmin`: `Author` não tem `archivedAt`/`createdAt`/`updatedAt`
 * no schema Prisma — mapeamento direto de campos.
 */
export function toAuthorAdmin(author: Author): AuthorAdmin {
  return {
    id: author.id,
    siteId: author.siteId,
    userId: author.userId,
    name: author.name,
    bio: author.bio,
    avatarUrl: author.avatarUrl,
  };
}
