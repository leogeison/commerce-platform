import { listProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { apiRequest } from './api-client';

const MAX_PAGE_SIZE = 100;

/**
 * `GET /admin/sites/:siteSlug/products` é paginado (`pageSize` máximo
 * `100`, `listProductsQuerySchema`) — não existe endpoint "sem paginação".
 * Busca todas as páginas com o maior `pageSize` permitido, sem filtro
 * `archived`/`categoryId` (retorna o catálogo inteiro do Site, ativos e
 * arquivados juntos), concatenando os itens até `page >= totalPages` (ou
 * lista vazia, cobrindo o caso `totalPages: 0`) — mesma estrutura de
 * `fetchAllCategories`/`fetchAllAuthors`.
 *
 * Único uso: resolver o catálogo completo de Produtos para a seção de
 * vínculo de Produtos do Artigo (`ArticleProductsSection`, ADM-009) —
 * calcula "disponíveis" (catálogo menos já vinculados) e resolve nome por
 * `productId` sem nenhuma chamada extra. Irmã de `fetchAllCategories`/
 * `fetchAllAuthors`, não uma abstração genérica parametrizada por
 * entidade — as três funções continuam independentes.
 */
export async function fetchAllProducts(siteSlug: string): Promise<ProductAdmin[]> {
  const all: ProductAdmin[] = [];
  let page = 1;

  for (;;) {
    const response = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/products?page=${page}&pageSize=${MAX_PAGE_SIZE}`,
      listProductsResponseSchema,
    );
    all.push(...response.items);

    if (page >= response.totalPages || response.items.length === 0) {
      break;
    }
    page += 1;
  }

  return all;
}
