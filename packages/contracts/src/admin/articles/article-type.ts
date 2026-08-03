import { z } from 'zod';

/**
 * Tipos de `Article` (schema Prisma, `enum ArticleType`,
 * `apps/api/prisma/schema.prisma`): `REVIEW`, `COMPARISON`, `BUYING_GUIDE`,
 * `DEAL` — os quatro valores exatamente definidos lá, nenhum inventado
 * aqui (mesmo critério de `marketplaceSchema` em `admin/common/`).
 *
 * Local em `admin/articles/`, não em `admin/common/`: sem reuso
 * cross-surface comprovado ainda (diferente de `marketplaceSchema`,
 * reaproveitado por `admin/products` e `admin/offers`) — mesmo princípio
 * de "não criar abstração sem necessidade comprovada" já aplicado no
 * projeto. Se `admin/public`/`admin/tracking` precisarem do mesmo enum no
 * futuro, essa é a hora de mover, não antes.
 */
export const articleTypeSchema = z.enum(['REVIEW', 'COMPARISON', 'BUYING_GUIDE', 'DEAL']);

export type ArticleType = z.infer<typeof articleTypeSchema>;
