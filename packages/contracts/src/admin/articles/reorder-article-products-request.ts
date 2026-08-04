import { z } from 'zod';

/**
 * Corpo de `PATCH /admin/sites/:siteSlug/articles/:id/products/reorder`
 * (`EDT-010`, reordenar Produtos do Artigo).
 *
 * `productIds`: lista **completa** e ordenada de todos os `productId`s
 * atualmente vinculados ao Artigo, na nova ordem desejada — a posição de
 * cada um é derivada do índice na lista (decisão explícita desta tarefa).
 * O caso de uso valida, contra o estado atual do banco, que o conjunto
 * recebido bate **exatamente** com o conjunto vinculado hoje (nem a mais,
 * nem a menos) — essa validação depende de estado e não pertence a este
 * contrato de forma.
 *
 * `.refine()` rejeitando `productId`s duplicados dentro da própria lista:
 * é um problema de forma do array recebido (não depende de nenhuma
 * consulta ao banco), então pertence à validação de schema — mesmo
 * critério do projeto de que "todo body é validado contra o schema Zod
 * antes do caso de uso" (INF-003) — e não ao caso de uso/repository.
 *
 * Lista vazia é uma entrada válida na *forma* (só é invalidada pelo caso
 * de uso se a coleção atual não estiver vazia também).
 */
export const reorderArticleProductsRequestSchema = z
  .object({
    productIds: z.array(z.string().uuid()),
  })
  .refine((data) => new Set(data.productIds).size === data.productIds.length, {
    message: 'productIds não pode conter valores duplicados.',
    path: ['productIds'],
  });

export type ReorderArticleProductsRequest = z.infer<typeof reorderArticleProductsRequestSchema>;
