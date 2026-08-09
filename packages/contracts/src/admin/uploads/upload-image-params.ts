import { z } from 'zod';

/**
 * Parâmetros de rota de `POST /admin/sites/:siteSlug/uploads/images`
 * (CTR-009; Architecture.md, Seção 29). Mesmo padrão de todo `*-params.ts`
 * do projeto (ex.: `category-params.ts`, CTR-003): o contrato representa
 * os parâmetros da URL, não o corpo multipart (`purpose`, corpo da UPL-002)
 * nem a resposta (`{ url }`, UPL-009).
 *
 * `siteSlug` só `z.string().min(1)`, mesmo critério já usado em todo o
 * projeto: nenhuma política de formato documentada ainda.
 */
export const uploadImageParamsSchema = z.object({
  siteSlug: z.string().min(1),
});

export type UploadImageParams = z.infer<typeof uploadImageParamsSchema>;
