import { z } from 'zod';

/**
 * Representação de `Author` na superfície administrativa (CTR-006).
 * Reaproveitada como corpo de resposta de criar (EDT-001), listar (cada
 * item, EDT-002) e detalhar (EDT-003) — mesmo padrão de `categoryAdminSchema`
 * (CTR-003): uma única forma "rasa" para as três operações, nenhuma
 * precisa de schema de resposta próprio.
 *
 * `id`, `siteId` sempre gerados pelo servidor — nunca aceitos em nenhum
 * request (`siteId` nunca vem do body, resolvido via `TenantContext`,
 * mesmo critério da CTR-003/004/005).
 *
 * Sem `archivedAt`/`createdAt`/`updatedAt`: diferente de Category/Product/
 * Offer, o schema Prisma de `Author` não tem esses campos — Author não
 * tem ciclo de arquivamento (`EDT-001 a EDT-005` não lista archive/
 * unarchive, só criar/listar/detalhar/atualizar(interno)/excluir).
 *
 * `userId` nulável — `Author.userId` é opcional no schema Prisma (autor
 * convidado sem `User` correspondente). `bio`/`avatarUrl` nuláveis pelo
 * mesmo motivo (`String?` no schema).
 *
 * `avatarUrl` só `z.string().min(1)` (sem `.url()`), mesmo critério já
 * usado em `imageUrl` de Produto (CTR-004) — não inventar regra de
 * formato não documentada.
 */
export const authorAdminSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string().min(1),
  bio: z.string().nullable(),
  avatarUrl: z.string().min(1).nullable(),
});

export type AuthorAdmin = z.infer<typeof authorAdminSchema>;
