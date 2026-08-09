import { z } from 'zod';
import { uploadPurposeSchema } from './upload-purpose.js';

/**
 * Corpo (campos de texto) do multipart de `POST
 * /admin/sites/:siteSlug/uploads/images` (UPL-002; Architecture.md, Seção
 * 29). Só `purpose` — o arquivo em si não entra aqui, é lido separadamente
 * via `@UploadedFile()` no controller (multer), nunca via Zod/`@Body()`.
 *
 * Reaproveita `uploadPurposeSchema` (UPL-001) sem alteração.
 */
export const uploadImageBodySchema = z.object({
  purpose: uploadPurposeSchema,
});

export type UploadImageBody = z.infer<typeof uploadImageBodySchema>;
