import { z } from 'zod';

/**
 * Status de `Article` (schema Prisma, `enum ArticleStatus`): `DRAFT`,
 * `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED` — os quatro valores exatamente
 * definidos lá. Exposto só como campo de resposta (`articleAdminSchema`)
 * e filtro de listagem (`listArticlesQuerySchema`) — nunca aceito em
 * `create-article-request.ts`/`update-article-request.ts` (`EDT-006`:
 * Artigo sempre nasce `DRAFT`; a máquina de estados, `EDT-012` a `EDT-016`,
 * é quem muda `status`, nunca um `PATCH` direto).
 *
 * Local em `admin/articles/`, mesmo critério de `articleTypeSchema`: sem
 * reuso cross-surface comprovado ainda.
 */
export const articleStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
]);

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
