import { z } from 'zod';

/**
 * Query string de `GET /public/sites/:siteSlug/categories` (UXF-010).
 * `page`/`pageSize` com os mesmos defaults e limite do resto do projeto
 * (`1`/`20`, máximo `100`) — mesmo padrão de `listPublicArticlesQuerySchema`
 * (PUB-002); não existe uma factory compartilhada para o lado da query hoje,
 * então este schema repete a mesma cadeia Zod em vez de inventar uma
 * abstração nova só para esta tarefa.
 *
 * Nenhum filtro de "só não arquivadas" aqui — isso é comportamento da
 * UXF-010, não forma do contrato (mesmo raciocínio do comentário análogo em
 * `listPublicArticlesQuerySchema` sobre `PUBLISHED`).
 */
export const listPublicCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListPublicCategoriesQuery = z.infer<typeof listPublicCategoriesQuerySchema>;
