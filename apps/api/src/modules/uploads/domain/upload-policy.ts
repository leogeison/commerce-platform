/**
 * Política de upload de imagem (UPL-003; decisão registrada aqui,
 * separada da validação em si — UPL-004 aplica os MIME types, UPL-005
 * aplica o limite de tamanho). Mesma regra para as três finalidades
 * (`PRODUCT`, `ARTICLE_COVER`, `AUTHOR_AVATAR`) — decisão explícita de
 * manter uma política única e simples no MVP, sem diferenciar por
 * finalidade sem necessidade documentada.
 *
 * Constante pura de domínio: nenhuma dependência de `@nestjs/*`, Prisma ou
 * dos contratos HTTP (`@commerce-platform/contracts`) — só a decisão em
 * si, importável tanto pela validação (`detectImageMimeType`/UPL-004, e a
 * checagem de tamanho no controller/UPL-005) quanto por qualquer teste que
 * precisar dela, sem arrastar nenhuma infraestrutura.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * 5 MiB (5.242.880 bytes) — `5 * 1024 * 1024` é a unidade binária (MiB),
 * não a decimal (MB, 5.000.000 bytes); documentado aqui como `5 MiB
 * (~5 MB)` exatamente para não deixar essa diferença ambígua. Limite
 * técnico do MVP, mesmo valor para as três finalidades.
 */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
