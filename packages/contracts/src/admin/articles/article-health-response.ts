import { z } from 'zod';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/articles/:id/health`
 * (`APP-001`) — read model não persistido, calculado sob demanda
 * (Architecture.md §12: "'Pendente' não é um status persistido — é
 * calculado por um read model (`/health`), nunca armazenado").
 *
 * Motivo de um Produto não ter Oferta válida: `NO_OFFERS` (nenhuma Oferta
 * cadastrada para o Produto neste Site) ou `NO_VALID_OFFER` (existem
 * Ofertas, mas nenhuma atende simultaneamente a arquivada = não, em
 * estoque = sim, URL HTTP(S) válida).
 */
export const invalidProductReasonSchema = z.enum(['NO_OFFERS', 'NO_VALID_OFFER']);

export type InvalidProductReason = z.infer<typeof invalidProductReasonSchema>;

export const invalidArticleProductSchema = z.object({
  productId: z.string().uuid(),
  reason: invalidProductReasonSchema,
});

export type InvalidArticleProduct = z.infer<typeof invalidArticleProductSchema>;

/**
 * `invalidProducts` preserva a ordem de `ArticleProduct.position` (mesmo
 * critério de ordenação já usado em `articleProductsResponseSchema`).
 *
 * `healthy` reflete somente as 6 condições de bloqueio de publicação
 * documentadas (Architecture.md §12: Categoria ativa; ao menos um Produto
 * vinculado; cada Produto com Oferta válida; slug único; `metaDescription`
 * preenchida; capa presente) — nunca considera o `status` atual do
 * Artigo. O checklist é o mesmo em qualquer status (`DRAFT`,
 * `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED`); a diferença de "framing" por
 * status (preparação/prontidão/operacional/informativo) é decisão de UI,
 * fora desta rota (ADM-011). A checagem adicional de `status ===
 * PENDING_REVIEW`, exigida só no momento de publicar, é responsabilidade
 * de `APP-002`, não deste read model.
 *
 * `slugUnique` está sempre `true` hoje — garantida estruturalmente pela
 * constraint `@@unique([siteId, slug])`, nunca falsa para um Artigo já
 * persistido. Mantida no contrato porque é uma das 6 condições
 * documentadas oficialmente.
 */
export const articleHealthResponseSchema = z.object({
  categoryActive: z.boolean(),
  hasAtLeastOneProduct: z.boolean(),
  allProductsHaveValidOffer: z.boolean(),
  invalidProducts: z.array(invalidArticleProductSchema),
  slugUnique: z.boolean(),
  metaDescriptionFilled: z.boolean(),
  coverImagePresent: z.boolean(),
  healthy: z.boolean(),
});

export type ArticleHealthResponse = z.infer<typeof articleHealthResponseSchema>;
