import { z } from 'zod';
import { articleStatusSchema } from './article-status.js';
import { articleTypeSchema } from '../../common/article-type.js';

/**
 * Query string de `GET /admin/sites/:siteSlug/articles` (`EDT-007`).
 *
 * `page`/`pageSize` com os mesmos defaults do resto do projeto (`1`/`20`,
 * máximo `100`). `status?`, `type?`, `categoryId?` — os três filtros
 * confirmados no backlog e no Architecture.md §32 ("Artigos: `status?`,
 * `type?`, `categoryId?`"), os únicos entre todas as listagens
 * administrativas com mais de um filtro simultâneo.
 */
export const listArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: articleStatusSchema.optional(),
  type: articleTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
