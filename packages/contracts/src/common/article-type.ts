import { z } from 'zod';

/**
 * Tipos de `Article` (schema Prisma, `enum ArticleType`,
 * `apps/api/prisma/schema.prisma`): `REVIEW`, `COMPARISON`, `BUYING_GUIDE`,
 * `DEAL` — os quatro valores exatamente definidos lá, nenhum inventado
 * aqui (mesmo critério de `marketplaceSchema`, também em `common/`).
 *
 * Movido de `admin/articles/` para cá na PUB-001 (CTR-010): passou a ter
 * consumidor real fora da superfície `admin` (`public/articles`), então a
 * dependência correta é `admin → common ← public`, nunca `public → admin`.
 * Mesma forma e mesmo nome exportado de antes — só o local mudou.
 */
export const articleTypeSchema = z.enum(['REVIEW', 'COMPARISON', 'BUYING_GUIDE', 'DEAL']);

export type ArticleType = z.infer<typeof articleTypeSchema>;
