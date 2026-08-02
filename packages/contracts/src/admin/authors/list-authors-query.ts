import { z } from 'zod';

/**
 * Query string de `GET /admin/sites/:siteSlug/authors` (EDT-002: "listar
 * (sem filtro)"). Só `page`/`pageSize`, mesmos defaults/limite já usados
 * em Categoria/Produto/Oferta (`1`/`20`, máximo `100`) — sem `archived`
 * (Author não arquiva) e sem nenhum outro filtro, conforme o backlog e o
 * Architecture.md ("Autores: nenhum" filtro na listagem administrativa).
 */
export const listAuthorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListAuthorsQuery = z.infer<typeof listAuthorsQuerySchema>;
