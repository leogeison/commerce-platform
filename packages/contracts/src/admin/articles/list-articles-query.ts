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
 *
 * `orderBy?` (UXA-017) — enum fechado, não uma API de sorting genérica:
 * expõe no boundary HTTP exatamente a capacidade já suportada
 * internamente por `findManyBySite`/`ListArticlesUseCase` desde a UXF-012
 * (`ArticleListOrderBy = 'createdAt_desc' | 'updatedAt_desc'`). Omitido =
 * comportamento default já existente (`createdAt desc`), preservado sem
 * alteração — mesma garantia já validada na UXF-012, agora também no
 * contrato HTTP. Consumido pelo Dashboard (`Continuar de onde parei`) para
 * pedir `status=DRAFT&orderBy=updatedAt_desc`.
 */
export const listArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: articleStatusSchema.optional(),
  type: articleTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  orderBy: z.enum(['createdAt_desc', 'updatedAt_desc']).optional(),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
