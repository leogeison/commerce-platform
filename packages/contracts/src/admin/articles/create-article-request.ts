import { z } from 'zod';
import { articleTypeSchema } from './article-type.js';

/**
 * Corpo de `POST /admin/sites/:siteSlug/articles` (`EDT-006`).
 *
 * `type`, `title`, `slug` obrigatórios (mesmos campos não-nuláveis, sem
 * default, do schema Prisma). `categoryId`, `authorId`, `metaDescription`,
 * `coverImageUrl`, `bodyMdx` opcionais — mesmo critério já usado em
 * `create-product-request.ts`/`create-author-request.ts`: omitir o campo é
 * a forma de "sem valor" na criação; `null` explícito não é uma entrada
 * válida aqui (nulável só na resposta, `articleAdminSchema`). `bodyMdx`
 * omitido vira `''` (default do schema Prisma).
 *
 * `categoryId`/`authorId` opcionais: `Article.categoryId`/`authorId` são
 * nuláveis no schema Prisma — Architecture.md confirma que `categoryId`
 * "permanece opcional" durante o rascunho, só se torna obrigatório na
 * publicação (fora do escopo desta tarefa).
 *
 * Sem `status`/`publishedAt`: Artigo sempre nasce `DRAFT` com
 * `publishedAt: null` — nem faz parte deste schema, então qualquer
 * `status`/`publishedAt` enviado no corpo é descartado pelo
 * `ZodValidationPipe` (comportamento padrão do `z.object()`, que remove
 * chaves desconhecidas em vez de rejeitar — mesmo comportamento em todo o
 * projeto, nenhum schema usa `.strict()`).
 *
 * Sem `productIds`: vincular Produto a um Artigo é `EDT-010`, tarefa
 * separada, só permitida em `DRAFT` — não antecipada aqui.
 */
export const createArticleRequestSchema = z.object({
  type: articleTypeSchema,
  title: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  metaDescription: z.string().optional(),
  coverImageUrl: z.string().min(1).optional(),
  bodyMdx: z.string().optional(),
});

export type CreateArticleRequest = z.infer<typeof createArticleRequestSchema>;
