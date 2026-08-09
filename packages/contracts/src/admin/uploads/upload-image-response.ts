import { z } from 'zod';

/**
 * Resposta de `POST /admin/sites/:siteSlug/uploads/images` (UPL-009;
 * Architecture.md, Seção 29: "resposta `{ url }`"). Só `min(1)`, não
 * `.url()`: a Seção 29 exige a forma `{ url }`, mas não impõe uma regra de
 * formato de URL além disso — mesmo precedente já usado pelos outros
 * contratos deste módulo.
 */
export const uploadImageResponseSchema = z.object({
  url: z.string().min(1),
});

export type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>;
