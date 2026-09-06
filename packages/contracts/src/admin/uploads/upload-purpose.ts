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
 * uniforme para todas as finalidades (`ALLOWED_IMAGE_MIME_TYPES`/
 * `MAX_IMAGE_SIZE_BYTES`, `apps/api/.../uploads/domain/upload-policy.ts`).
 * `purpose` existe só para o cliente saber em qual campo/local aplicar a
 * URL retornada.
 *
 * `ARTICLE_BODY_IMAGE` (UXE-010) — adicionado de forma aditiva a este
 * enum, decisão fechada no desenho aprovado da tarefa. Diferente de
 * `PRODUCT`/`ARTICLE_COVER`/`AUTHOR_AVATAR` (cada uma mapeando 1:1 para um
 * campo estrutural dedicado do recurso — `imageUrl`/`coverImageUrl`/
 * `avatarUrl`), uma imagem de corpo de Artigo não tem campo estrutural
 * próprio: a URL retornada é escrita direto no texto de
 * `Article.bodyMdx` (sintaxe Markdown `![alt](<url>)`, ver
 * `article-body-image/`), nunca em uma coluna dedicada — não existe (nem
 * esta tarefa cria) nenhuma entidade `Media`. Reaproveitar `ARTICLE_COVER`
 * para esse caso seria semanticamente incorreto (a imagem de corpo não é
 * a capa do Artigo) e colapsaria dois destinos diferentes sob o mesmo
 * valor. Confirmado antes da implementação: esta adição é estritamente
 * aditiva — nenhum `switch`/checagem de exaustividade sobre este enum
 * existe em nenhuma camada do projeto; todo consumidor usa sempre um
 * literal fixo próprio (`'PRODUCT'`, `'ARTICLE_COVER'` ou
 * `'AUTHOR_AVATAR'`), nunca uma comparação exaustiva contra o conjunto
 * inteiro — nenhum outro arquivo precisou mudar por causa desta adição.
 */
export const uploadPurposeSchema = z.enum(['PRODUCT', 'ARTICLE_COVER', 'AUTHOR_AVATAR', 'ARTICLE_BODY_IMAGE']);

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;
