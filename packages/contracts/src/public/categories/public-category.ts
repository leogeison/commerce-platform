import { z } from 'zod';

/**
 * Corpo de resposta de `GET /public/sites/:siteSlug/categories/:slug`
 * (PUB-004; PUB-001/CTR-010). Só `name`/`slug`: sem `id`/`siteId`/
 * `archivedAt`/`createdAt`/`updatedAt` — nenhum consumidor público
 * documentado para eles. O Artigo já carrega `categorySlug` solto (não um
 * objeto Categoria aninhado, Architecture.md §31), então este schema só
 * serve à própria PUB-004.
 */
export const publicCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

export type PublicCategory = z.infer<typeof publicCategorySchema>;
