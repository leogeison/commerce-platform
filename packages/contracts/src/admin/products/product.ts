import { z } from 'zod';

/**
 * Representação de `Product` na superfície administrativa (CTR-004).
 * Reaproveitada como corpo de resposta de criar, listar (cada item) e
 * (CAT-012/013) arquivar/desarquivar — mesmo padrão já usado em
 * `categoryAdminSchema` (CTR-003). O detalhe (CAT-010) usa
 * `productDetailAdminSchema`, que estende este schema com `offers`.
 *
 * `id`, `siteId`, `archivedAt`, `createdAt`, `updatedAt` são sempre
 * gerados pelo servidor — nunca aceitos em nenhum request (`siteId` nunca
 * vem do body, resolvido via `TenantContext`, mesmo critério da CTR-003).
 *
 * `categoryId`, `description`, `imageUrl`, `archivedAt` nuláveis na
 * resposta — reflete o schema Prisma (`Product.categoryId`/`description`/
 * `imageUrl` são `String?`, `archivedAt` é `DateTime?`).
 *
 * `imageUrl` só `z.string().min(1)` (sem `.url()`) de propósito — mesmo
 * critério de "não inventar regra não documentada" já usado no `slug` da
 * Categoria (CTR-003); decisão explícita da CTR-004. `description` sem
 * `.min(1)`: nenhum tamanho mínimo foi definido para texto livre.
 */
export const productAdminSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  imageUrl: z.string().min(1).nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProductAdmin = z.infer<typeof productAdminSchema>;
