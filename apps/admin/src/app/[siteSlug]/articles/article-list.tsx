'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  articleStatusSchema,
  articleTypeSchema,
  listArticlesResponseSchema,
  type ArticleStatus,
  type ArticleType,
  type CategoryAdmin,
  type ListArticlesResponse,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { STATUS_LABELS, TYPE_LABELS } from '../../../lib/article-labels';
import { fetchAllCategories } from '../../../lib/fetch-all-categories';
import styles from './article-list.module.css';

interface ArticleListProps {
  siteSlug: string;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListArticlesResponse };

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar os Artigos. Tente novamente em instantes.';
const GENERIC_CATEGORIES_ERROR_MESSAGE = 'Não foi possível carregar as Categorias.';
const PAGE_SIZE = 20;
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

function resolveErrorMessage(error: unknown): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * `siteSlug`/`categoryId` sem formato fixo garantido no contrato de rota —
 * `encodeURIComponent` em todo segmento dinâmico, mesma cautela das telas
 * anteriores. `status`/`type` só entram na query quando um filtro está
 * ativo (`listArticlesQuerySchema`: ambos opcionais).
 */
function buildListPath(
  siteSlug: string,
  page: number,
  status: ArticleStatus | '',
  type: ArticleType | '',
  categoryId: string,
): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  if (status !== '') {
    params.set('status', status);
  }
  if (type !== '') {
    params.set('type', type);
  }
  if (categoryId !== '') {
    params.set('categoryId', categoryId);
  }
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles?${params.toString()}`;
}

/**
 * Resolve o nome de Categoria de uma linha a partir do MESMO array já
 * buscado para popular o filtro (`categoriesState`) — nenhuma busca extra,
 * nenhuma busca de Autor (fora de escopo desta tela). `categoryId === null`
 * sempre "Sem categoria", independente do carregamento de Categorias.
 * Enquanto `categoriesState` não está `'ready'` (carregando ou erro), mostra
 * um traço neutro — a listagem de Artigos não é bloqueada por isso.
 */
function categoryLabel(categoryId: string | null, categoriesState: CategoriesState): string {
  if (categoryId === null) {
    return 'Sem categoria';
  }
  if (categoriesState.status !== 'ready') {
    return '—';
  }
  const category = categoriesState.items.find((item) => item.id === categoryId);
  if (!category) {
    return '—';
  }
  return category.archivedAt ? `${category.name} (arquivada)` : category.name;
}

/**
 * `articleHref` aponta para `/:siteSlug/articles/:id` — rota criada na
 * ADM-009 (`ArticleDetail`). Até a ADM-008, as linhas eram só texto porque
 * essa rota não existia; agora que existe, cada linha e o botão "Novo
 * Artigo" apontam para ela, mesmo padrão de `productHref`/"Novo Produto"
 * em `ProductList`.
 */
function articleHref(siteSlug: string, articleId: string): string {
  return `/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}`;
}

/**
 * `/:siteSlug/articles` (ADM-008; Architecture.md §32) — listagem,
 * paginação e os três filtros combináveis (`status`/`type`/`categoryId`,
 * `listArticlesQuerySchema`, `EDT-007`). Link por linha para `/:id` e
 * botão "Novo Artigo" para `/new` acrescentados na ADM-009, quando essas
 * rotas passaram a existir (`ArticleDetail`/`CreateArticle`). Nenhuma
 * transição de status, `/health` ou lógica de Role aqui — isso é
 * ADM-010/011/012.
 *
 * Busca de Artigos (`GET /articles`) e busca de Categorias (só para o
 * filtro e para resolver o nome de cada linha, via `fetchAllCategories`)
 * são efeitos independentes, com estados (`state`/`categoriesState`)
 * também independentes: uma falha ao carregar Categorias NÃO derruba a
 * listagem de Artigos — só desabilita o `<select>` de Categoria e mostra
 * uma mensagem de erro específica ao lado dele. Já uma falha em
 * `GET /articles` mostra o erro principal da página e não renderiza
 * nenhum item, como se fossem dados válidos.
 *
 * `<table>` semântica (não `<ul>/<li>`) porque os dados são naturalmente
 * tabulares — quatro colunas fixas (Título/Status/Tipo/Categoria) por
 * linha, mesmo campo em toda linha. Sem componente de tabela genérico:
 * é só o marcador HTML certo para o formato do dado desta tela.
 */
export function ArticleList({ siteSlug }: ArticleListProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ArticleStatus | ''>('');
  const [type, setType] = useState<ArticleType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchAllCategories(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCategoriesState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoriesState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  useEffect(() => {
    let cancelled = false;

    apiRequest(buildListPath(siteSlug, page, status, type, categoryId), listArticlesResponseSchema)
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'ready', data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: resolveErrorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, page, status, type, categoryId]);

  function handlePageChange(nextPage: number) {
    setState({ status: 'loading' });
    setPage(nextPage);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    setState({ status: 'loading' });
    setStatus(event.target.value as ArticleStatus | '');
    setPage(1);
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    setState({ status: 'loading' });
    setType(event.target.value as ArticleType | '');
    setPage(1);
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    setState({ status: 'loading' });
    setCategoryId(event.target.value);
    setPage(1);
  }

  return (
    <div className={styles.list}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.field}>
            <label htmlFor="status-filter">Status</label>
            <select id="status-filter" value={status} onChange={handleStatusChange}>
              <option value="">Todos</option>
              {articleStatusSchema.options.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="type-filter">Tipo</label>
            <select id="type-filter" value={type} onChange={handleTypeChange}>
              <option value="">Todos</option>
              {articleTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="category-filter">Categoria</label>
            <select
              id="category-filter"
              value={categoryId}
              onChange={handleCategoryChange}
              disabled={categoriesState.status !== 'ready'}
            >
              <option value="">Todas</option>
              {categoriesState.status === 'ready' &&
                categoriesState.items.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.archivedAt ? ' (arquivada)' : ''}
                  </option>
                ))}
            </select>
            {categoriesState.status === 'error' && (
              <p role="alert" className={styles.fieldError}>
                {GENERIC_CATEGORIES_ERROR_MESSAGE}
              </p>
            )}
          </div>
        </div>
        <Link href={`/${encodeURIComponent(siteSlug)}/articles/new`}>Novo Artigo</Link>
      </div>

      {state.status === 'loading' && <p className={styles.status}>Carregando...</p>}

      {state.status === 'error' && (
        <p role="alert" className={styles.status}>
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <p className={styles.status}>Nenhum Artigo encontrado.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Status</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((article) => (
                  <tr key={article.id}>
                    <th scope="row">
                      <Link href={articleHref(siteSlug, article.id)}>{article.title}</Link>
                    </th>
                    <td>{STATUS_LABELS[article.status]}</td>
                    <td>{TYPE_LABELS[article.type]}</td>
                    <td>{categoryLabel(article.categoryId, categoriesState)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className={styles.pagination}>
            <button type="button" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
              Anterior
            </button>
            {state.data.totalPages > 0 && (
              <span>
                Página {state.data.page} de {state.data.totalPages}
              </span>
            )}
            <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page >= state.data.totalPages}>
              Próxima
            </button>
          </div>
        </>
      )}
    </div>
  );
}
