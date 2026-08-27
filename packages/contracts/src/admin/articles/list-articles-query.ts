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
 * `orderBy?` (UXA-017; estendido pela UXA-018) — enum fechado, não uma API
 * de sorting genérica: expõe no boundary HTTP exatamente a capacidade já
 * suportada internamente por `findManyBySite`/`ListArticlesUseCase`
 * (`ArticleListOrderBy = 'createdAt_desc' | 'updatedAt_desc' |
 * 'publishedAt_desc'`). Omitido = comportamento default já existente
 * (`createdAt desc`), preservado sem alteração — mesma garantia já
 * validada na UXF-012, agora também no contrato HTTP.
 *
 * `updatedAt_desc` — Dashboard, seção "Continuar de onde parei"
 * (`status=DRAFT&orderBy=updatedAt_desc`, UXA-017).
 *
 * `publishedAt_desc` (UXA-018) — Dashboard, seção "Publicados recentemente"
 * (`status=PUBLISHED&orderBy=publishedAt_desc`). Extensão mínima
 * autorizada nesta tarefa: investigação da UXA-018 confirmou que nenhum
 * caminho Admin existente ordenava por `publishedAt` (só a API pública,
 * `findManyPublishedBySite`/`ListPublicArticlesUseCase`, inacessível a
 * partir do Dashboard autenticado) — sem este valor, "Publicados
 * recentemente" só poderia refletir `createdAt desc`, semanticamente
 * incorreto para uma seção sobre o momento de publicação. Nenhuma
 * validação cruzada exigindo `status=PUBLISHED` junto de
 * `orderBy=publishedAt_desc` foi introduzida — o par é uma convenção de
 * uso do Dashboard, não uma regra do contrato.
 *
 * A ordenação de "Aguardando publicação" (`status=PENDING_REVIEW`)
 * permanece o default existente (`createdAt desc`, sem `orderBy` no
 * request) — não há timestamp de "entrada em revisão" no schema, então
 * não há o que expor aqui para essa seção.
 */
export const listArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: articleStatusSchema.optional(),
  type: articleTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  orderBy: z.enum(['createdAt_desc', 'updatedAt_desc', 'publishedAt_desc']).optional(),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
