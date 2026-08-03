import { z } from 'zod';
import { articleStatusSchema } from './article-status.js';
import { articleTypeSchema } from './article-type.js';

/**
 * Representação completa de `Article` na superfície administrativa
 * (CTR-007). Reaproveitada como corpo de resposta de criar (`EDT-006`),
 * detalhar (`EDT-008`) e atualizar (`EDT-009`) — a listagem (`EDT-007`)
 * usa `articleSummaryAdminSchema` (`article-summary.ts`), que omite
 * `bodyMdx` de propósito (ver lá).
 *
 * `id`, `siteId`, `status`, `publishedAt`, `createdAt`, `updatedAt`
 * sempre gerados/controlados pelo servidor — nunca aceitos em nenhum
 * request (`siteId` nunca vem do body, mesmo critério da CTR-003 em
 * diante; `status`/`publishedAt` nunca entram em `create`/`update`
 * — Artigo sempre nasce `DRAFT`, com `publishedAt: null`, e só a máquina
 * de estados de `EDT-012` a `EDT-016` muda isso).
 *
 * `categoryId`, `authorId`, `metaDescription`, `coverImageUrl` nuláveis
 * na resposta — reflete o schema Prisma (`String?`/FK opcional). `bodyMdx`
 * nunca nulo (`String @default("")`) — sempre pelo menos string vazia.
 *
 * `coverImageUrl` só `z.string().min(1)` (sem `.url()`), mesmo critério já
 * usado em `imageUrl` de Produto e `avatarUrl` de Author — não inventar
 * regra de formato não documentada.
 */
export const articleAdminSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  authorId: z.string().uuid().nullable(),
  type: articleTypeSchema,
  status: articleStatusSchema,
  title: z.string().min(1),
  slug: z.string().min(1),
  metaDescription: z.string().nullable(),
  coverImageUrl: z.string().min(1).nullable(),
  bodyMdx: z.string(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ArticleAdmin = z.infer<typeof articleAdminSchema>;
