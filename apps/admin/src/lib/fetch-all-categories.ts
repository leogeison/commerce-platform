import { listCategoriesResponseSchema, type CategoryAdmin } from '@commerce-platform/contracts';
import { apiRequest } from './api-client';

const MAX_PAGE_SIZE = 100;

/**
 * `GET /admin/sites/:siteSlug/categories` é paginado (`pageSize` máximo
 * `100`, `listCategoriesQuerySchema`) — não existe endpoint "sem
 * paginação" e a ADM-006 não cria um novo. Busca todas as páginas com o
 * maior `pageSize` permitido, sem filtro `archived` (retorna ativas e
 * arquivadas juntas, mesma semântica de 3 estados já usada na ADM-005),
 * concatenando os itens até `page >= totalPages` (ou lista vazia, cobrindo
 * o caso `totalPages: 0`).
 *
 * Movida de `products/` para `lib/` na ADM-008: passou a ter dois
 * consumidores reais e independentes — `ProductForm`/`ProductList`
 * (vínculo/filtro de Categoria do Produto, ADM-006) e `ArticleList`
 * (filtro de Categoria do Artigo, ADM-008). Continua sendo uma função só
 * de Categoria, não uma abstração genérica entre entidades — nenhum
 * repository/hook genérico/provider/Context criado.
 */
export async function fetchAllCategories(siteSlug: string): Promise<CategoryAdmin[]> {
  const all: CategoryAdmin[] = [];
  let page = 1;

  for (;;) {
    const response = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/categories?page=${page}&pageSize=${MAX_PAGE_SIZE}`,
      listCategoriesResponseSchema,
    );
    all.push(...response.items);

    if (page >= response.totalPages || response.items.length === 0) {
      break;
    }
    page += 1;
  }

  return all;
}
