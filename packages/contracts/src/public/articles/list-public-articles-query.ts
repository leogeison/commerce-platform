import { z } from 'zod';
import { articleTypeSchema } from '../../common/article-type.js';

/**
 * Query string de `GET /public/sites/:siteSlug/articles` (PUB-002).
 * `page`/`pageSize` com os mesmos defaults do resto do projeto (`1`/`20`,
 * máximo `100`). `categorySlug?`/`type?` — os dois filtros confirmados no
 * Architecture.md §31 ("filtros permitidos: por categoria e por tipo").
 *
 * `categorySlug`, não `categoryId`: API pública não expõe nem exige
 * identificadores internos quando o slug já é suficiente — mesmo critério
 * usado em todo o resto da superfície `public`.
 *
 * Nenhuma regra de "só `PUBLISHED`" aqui — isso é comportamento da PUB-002,
 * não forma do contrato.
 */
export const listPublicArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  categorySlug: z.string().min(1).optional(),
  type: articleTypeSchema.optional(),
});

export type ListPublicArticlesQuery = z.infer<typeof listPublicArticlesQuerySchema>;
