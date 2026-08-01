import { z } from 'zod';

/**
 * Query string de `GET /admin/sites/:siteSlug/categories` (CAT-002).
 *
 * `page`/`pageSize` com defaults aprovados (1 / 20, máximo 100) — não
 * documentados no Architecture.md, decisão explícita desta tarefa.
 *
 * `archived`: **não** usa `z.coerce.boolean()` de propósito — em query
 * string, `Boolean("false")` é `true` em JS, então `z.coerce.boolean()`
 * aceitaria `?archived=false` como `true`. Só aceita as strings literais
 * `"true"`/`"false"`, convertidas explicitamente.
 *
 * Nenhum parâmetro de ordenação: não documentado, fica implícito na
 * implementação (CAT-002 define uma ordem determinística internamente).
 */
export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
