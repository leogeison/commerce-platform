import { z } from 'zod';

/**
 * Finalidade do upload (CTR-009; Architecture.md, Seção 29: "entrada
 * multipart com arquivo e finalidade (`PRODUCT`, `ARTICLE_COVER` ou
 * `AUTHOR_AVATAR`)"). Não existe entidade `Media` no schema Prisma — este
 * valor nunca é persistido; por isso não tem contraparte em `enums.ts` do
 * Prisma, diferente de `Marketplace`/`Role`/`ArticleType`.
 *
 * Consumido no corpo do multipart via `uploadImageBodySchema` (UPL-002).
 * Validado, mas não usado para diferenciar a validação de MIME/tamanho por
 * finalidade — a UPL-003 decidiu deliberadamente uma política única e
 * uniforme para as três (`ALLOWED_IMAGE_MIME_TYPES`/`MAX_IMAGE_SIZE_BYTES`,
 * `apps/api/.../uploads/domain/upload-policy.ts`). `purpose` existe só
 * para o cliente saber em qual campo do recurso (`imageUrl`/
 * `coverImageUrl`/`avatarUrl`) aplicar a URL retornada.
 */
export const uploadPurposeSchema = z.enum(['PRODUCT', 'ARTICLE_COVER', 'AUTHOR_AVATAR']);

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;
