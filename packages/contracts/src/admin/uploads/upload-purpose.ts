import { z } from 'zod';

/**
 * Finalidade do upload (CTR-009; Architecture.md, Seção 29: "entrada
 * multipart com arquivo e finalidade (`PRODUCT`, `ARTICLE_COVER` ou
 * `AUTHOR_AVATAR`)"). Não existe entidade `Media` no schema Prisma — este
 * valor nunca é persistido, só orienta a validação de MIME/tamanho por
 * finalidade nas tarefas seguintes (UPL-003 em diante); por isso não tem
 * contraparte em `enums.ts` do Prisma, diferente de `Marketplace`/`Role`/
 * `ArticleType`.
 *
 * Onde este schema é consumido (corpo do multipart) é decisão da UPL-002,
 * fora do escopo desta tarefa — aqui só a superfície de valores válidos.
 */
export const uploadPurposeSchema = z.enum(['PRODUCT', 'ARTICLE_COVER', 'AUTHOR_AVATAR']);

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;
