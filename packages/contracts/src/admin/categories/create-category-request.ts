import { z } from 'zod';

/**
 * Corpo de `POST /admin/sites/:siteSlug/categories` (CAT-001).
 *
 * `slug` só `z.string().min(1)` de propósito (CTR-003): a política de
 * formato/normalização de slug não está documentada em nenhum lugar
 * oficial ainda — não inventar regex aqui. Quando essa regra existir,
 * entra como sua própria decisão, não implícita num contrato.
 */
export const createCategoryRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
