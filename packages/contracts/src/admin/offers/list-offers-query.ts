import { z } from 'zod';

/**
 * Query string de `GET /admin/sites/:siteSlug/products/:productId/offers`
 * (CAT-016). Só paginação — sem `archived` nem qualquer outro filtro
 * (Architecture.md: "Ofertas: nenhum [filtro]. Sem busca textual em
 * nenhuma listagem; todas paginadas.") — decisão documentada, não uma
 * escolha desta tarefa.
 *
 * `page`/`pageSize` com os mesmos defaults já usados em Categoria/Produto
 * (1 / 20, máximo 100).
 */
export const listOffersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
