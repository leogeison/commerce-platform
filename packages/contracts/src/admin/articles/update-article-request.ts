import { z } from 'zod';
import { articleTypeSchema } from './article-type.js';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/articles/:id` (`EDT-009` —
 * contrato entregue agora, mesmo padrão de `CTR-003` entregando o bloco
 * inteiro de Categoria antes de `CAT-001`; o caso de uso/endpoint de
 * `EDT-009` não é implementado nesta tarefa).
 *
 * Primeira superfície do projeto com semântica PATCH parcial de verdade —
 * decisão explícita desta tarefa, três estados por campo nulável
 * (`categoryId`, `authorId`, `metaDescription`, `coverImageUrl`):
 * **omitido** = não mexer no campo; **`null`** explícito = limpar o campo
 * (volta a `null` no banco); **valor** = definir. Por isso esses quatro
 * campos são `.nullable().optional()`, não só `.optional()` como no
 * `create-article-request.ts` — lá `null` explícito não é uma entrada
 * válida porque criação não tem "campo atual" para limpar.
 *
 * `type`, `title`, `slug`, `bodyMdx` só `.optional()` (sem `.nullable()`):
 * não são nuláveis no schema Prisma (`type`/`title`/`slug` obrigatórios,
 * `bodyMdx` tem default `''`, nunca `null`) — "limpar" um campo obrigatório
 * não faz sentido; omitido = não mexer, valor = definir. `bodyMdx` pode
 * ser definido como string vazia (`''`), mas isso é um valor, não uma
 * limpeza.
 *
 * Sem `status`/`publishedAt`, mesmo critério de `create-article-request.ts`:
 * a máquina de estados (`EDT-012` a `EDT-016`) é o único caminho que muda
 * `status`, nunca este endpoint.
 *
 * `EDT-009` bloqueia atualização fora de `DRAFT` (`409`) — regra de
 * negócio do caso de uso, não deste contrato de forma.
 */
export const updateArticleRequestSchema = z.object({
  type: articleTypeSchema.optional(),
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  authorId: z.string().uuid().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  coverImageUrl: z.string().min(1).nullable().optional(),
  bodyMdx: z.string().optional(),
});

export type UpdateArticleRequest = z.infer<typeof updateArticleRequestSchema>;
