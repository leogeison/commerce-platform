import { listAuthorsResponseSchema, type AuthorAdmin } from '@commerce-platform/contracts';
import { apiRequest } from './api-client';

const MAX_PAGE_SIZE = 100;

/**
 * `GET /admin/sites/:siteSlug/authors` é paginado (`pageSize` máximo `100`,
 * `listAuthorsQuerySchema`) — não existe endpoint "sem paginação". Busca
 * todas as páginas com o maior `pageSize` permitido, concatenando os itens
 * até `page >= totalPages` (ou lista vazia, cobrindo o caso `totalPages:
 * 0`) — mesma estrutura de `fetchAllCategories`.
 *
 * Sem filtro `archived`: Author não tem ciclo de arquivamento
 * (`authorAdminSchema` não tem `archivedAt`), então não há nada para
 * filtrar aqui — todos os Autores retornados são igualmente elegíveis.
 *
 * Único uso: popular o `<select>` de Autor do formulário de Artigo
 * (`ArticleForm`, ADM-009) — irmã de `fetchAllCategories`, não uma
 * abstração genérica parametrizada por entidade; as duas funções
 * continuam independentes.
 */
export async function fetchAllAuthors(siteSlug: string): Promise<AuthorAdmin[]> {
  const all: AuthorAdmin[] = [];
  let page = 1;

  for (;;) {
    const response = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/authors?page=${page}&pageSize=${MAX_PAGE_SIZE}`,
      listAuthorsResponseSchema,
    );
    all.push(...response.items);

    if (page >= response.totalPages || response.items.length === 0) {
      break;
    }
    page += 1;
  }

  return all;
}
