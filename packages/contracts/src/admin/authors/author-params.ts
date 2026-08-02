import { z } from 'zod';

/**
 * Parâmetros de rota das superfícies de Autor (CTR-006) — mesmo padrão de
 * `category-params.ts`/`product-params.ts`: o contrato representa todos
 * os parâmetros da URL, não só o corpo/query.
 *
 * `siteSlug` só `z.string().min(1)`, mesmo motivo já usado em Categoria/
 * Produto/Oferta: nenhuma política de formato documentada ainda.
 */

/** `POST /admin/sites/:siteSlug/authors`, `GET /admin/sites/:siteSlug/authors` */
export const authorsSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type AuthorsSiteParams = z.infer<typeof authorsSiteParamsSchema>;

/**
 * `GET /admin/sites/:siteSlug/authors/:id` (EDT-003), `DELETE
 * /admin/sites/:siteSlug/authors/:id` (EDT-005) — entregue já na CTR-006
 * mesmo sem uso ainda em `EDT-001` (mesma antecipação de contrato já
 * feita em `category-params.ts` na CTR-003, que trouxe o schema de `:id`
 * antes de `CAT-003` existir).
 *
 * Sem contrato de parâmetros para `EDT-004` (atualizar) — mesma decisão
 * já tomada para `CAT-004`/`CAT-011`/`CAT-018`: operação interna, sem
 * rota HTTP direta nesta fase (endpoint real só na `REV-014`).
 */
export const authorParamsSchema = z.object({
  siteSlug: z.string().min(1),
  id: z.string().uuid(),
});

export type AuthorParams = z.infer<typeof authorParamsSchema>;
