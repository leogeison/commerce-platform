import { z } from 'zod';

/**
 * Envelope de paginação padrão para qualquer endpoint que liste coleções
 * (Architecture.md, seção 26). `paginatedResponseSchema` é uma factory —
 * cada endpoint monta o schema real passando o schema Zod dos itens da
 * página, mantendo o envelope consistente em toda a API.
 */
export function paginatedResponseSchema<ItemSchema extends z.ZodTypeAny>(
  itemSchema: ItemSchema,
) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });
}

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
