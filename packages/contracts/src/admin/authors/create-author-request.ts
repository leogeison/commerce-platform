import { z } from 'zod';

/**
 * Corpo de `POST /admin/sites/:siteSlug/authors` (EDT-001).
 *
 * `bio`/`avatarUrl`/`userId` apenas opcionais — nunca aceitam `null`
 * explícito no request (mesmo critério da CTR-004 para `categoryId`/
 * `description`/`imageUrl` de Produto): omitir o campo é a forma de "sem
 * bio"/"sem avatar"/"autor convidado sem User" na criação. Nulável só na
 * resposta (`authorAdminSchema`).
 *
 * `userId` opcional e `uuid()`: `Author.userId` é nulável no schema
 * Prisma — um Author pode nascer sem `User` vinculado (autor convidado).
 * Quando informado, `EDT-001` só garante que referencia um `User`
 * existente e que esse `userId` ainda não tem outro Author neste Site
 * (`409`, `@@unique([siteId, userId])`) — não exige que o `User` tenha
 * `SiteUser` neste Site: a relação representa uma identidade global
 * opcionalmente associada a uma persona editorial do Site, não uma
 * permissão administrativa ativa nele (decisão explícita desta tarefa,
 * para não acoplar Editorial a Identity & Access sem previsão no
 * Architecture.md/backlog).
 */
export const createAuthorRequestSchema = z.object({
  name: z.string().min(1),
  bio: z.string().optional(),
  avatarUrl: z.string().min(1).optional(),
  userId: z.string().uuid().optional(),
});

export type CreateAuthorRequest = z.infer<typeof createAuthorRequestSchema>;
