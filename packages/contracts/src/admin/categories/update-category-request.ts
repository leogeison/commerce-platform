import { z } from 'zod';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/categories/:id` (REV-009; CAT-004).
 *
 * Mesma semântica PATCH parcial de `update-article-request.ts`: campo
 * omitido não é tocado. `name`/`slug` só `.optional()`, sem `.nullable()`
 * — nenhum dos dois é nulável no schema Prisma de `Category`, mesma razão
 * de `type`/`title`/`slug` em `update-article-request.ts`.
 *
 * Sem `.refine()` exigindo ao menos um campo: um corpo `{}` é válido,
 * mesmo precedente de `update-article-request.ts` — a semântica de "nada
 * mudou" já é resolvida naturalmente pelo `undefined` não entrando na
 * instrução de persistência, não precisa ser rejeitada na forma.
 */
export const updateCategoryRequestSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
