import { z } from 'zod';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/products/:id` (REV-010; CAT-011).
 *
 * Mesma semântica PATCH parcial de `update-article-request.ts`/
 * `update-category-request.ts`: campo omitido não é tocado. `name`/`slug`
 * só `.optional()` (não nuláveis no schema Prisma, "limpar" não faz
 * sentido). `categoryId`/`description`/`imageUrl` são `.nullable().optional()`
 * — os três são nuláveis no schema Prisma de `Product` — três estados por
 * campo: **omitido** = não mexer; **`null`** explícito = limpar (volta a
 * `null` no banco); **valor** = definir.
 *
 * Sem `.refine()` exigindo ao menos um campo: um corpo `{}` é válido,
 * mesmo precedente já usado em Article/Categoria.
 */
export const updateProductRequestSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().min(1).nullable().optional(),
});

export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
