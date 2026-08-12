import { z } from 'zod';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/authors/:id` (EDT-004; REV-014).
 *
 * `name` só opcional (não nulável) — mesmo critério de `updateOfferRequestSchema`
 * para campos não nuláveis do schema Prisma: omitir é "não alterar", não
 * existe "sem nome".
 *
 * `bio`/`avatarUrl`/`userId` nuláveis e opcionais — semântica tri-state,
 * mesmo padrão de `updateCategoryRequestSchema`/`updateProductRequestSchema`
 * para os campos nuláveis do schema Prisma correspondente: campo omitido
 * (`undefined`) não altera o vínculo/valor atual; campo `null` explícito
 * limpa (para `bio`/`avatarUrl`) ou remove o vínculo com `User`, tornando o
 * Author um autor convidado (para `userId`); campo com valor define/troca.
 *
 * `userId` reproduz exatamente a mesma regra de tenancy já documentada em
 * `createAuthorRequestSchema`: só garante que referencia um `User`
 * existente e que esse `userId` ainda não tem outro Author neste Site — não
 * exige `SiteUser` neste Site (decisão explícita de `EDT-001`, não repetida
 * nem revisitada por esta tarefa).
 */
export const updateAuthorRequestSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().nullable().optional(),
  avatarUrl: z.string().min(1).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
});

export type UpdateAuthorRequest = z.infer<typeof updateAuthorRequestSchema>;
