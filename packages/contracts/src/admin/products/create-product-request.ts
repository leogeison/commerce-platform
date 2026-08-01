import { z } from 'zod';

/**
 * Corpo de `POST /admin/sites/:siteSlug/products` (CAT-008).
 *
 * `slug` só `z.string().min(1)`, mesmo critério já usado em Categoria
 * (CTR-003) — sem regex, política de formato não documentada.
 *
 * `categoryId`, `description`, `imageUrl` apenas opcionais aqui — nunca
 * aceitam `null` no request (decisão explícita da CTR-004): omitir o
 * campo é a forma de "sem Categoria"/"sem descrição"/"sem imagem" na
 * criação; `null` explícito não é uma entrada válida. Nulável só na
 * resposta (`productAdminSchema`), nunca no request.
 *
 * `categoryId` opcional: `Product.categoryId` é nulável no schema Prisma
 * — um Produto pode nascer sem Categoria.
 */
export const createProductRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  imageUrl: z.string().min(1).optional(),
});

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
