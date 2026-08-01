import { z } from 'zod';

/**
 * Representação de `Category` na superfície administrativa (CTR-003).
 * Reaproveitada como corpo de resposta de criar, detalhar, arquivar e
 * desarquivar (CAT-001/003/005/006) — as quatro operações devolvem a
 * mesma forma da entidade, nenhuma precisa de um schema de resposta
 * próprio.
 *
 * `id`, `siteId`, `archivedAt`, `createdAt`, `updatedAt` são sempre
 * gerados pelo servidor — nunca aceitos em nenhum request (`siteId` em
 * especial nunca vem do body, Architecture.md/INF-008: é sempre resolvido
 * via `TenantContext`).
 *
 * Sem hierarquia: o schema Prisma de `Category` não tem `parentId` nem
 * relação de árvore — categorias são uma lista plana por Site.
 *
 * Sem enum de status: diferente de `Article.status`, `Category` só tem
 * `archivedAt` nulável — estado binário ativo/arquivado, exposto cru, sem
 * campo `active` derivado redundante.
 */
export const categoryAdminSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CategoryAdmin = z.infer<typeof categoryAdminSchema>;
