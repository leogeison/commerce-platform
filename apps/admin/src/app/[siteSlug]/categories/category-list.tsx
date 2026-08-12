'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { listCategoriesResponseSchema, type ListCategoriesResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import styles from './category-list.module.css';

interface CategoryListProps {
  siteSlug: string;
}

type ArchivedFilter = 'all' | 'active' | 'archived';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListCategoriesResponse };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar as Categorias. Tente novamente em instantes.';
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
 * `siteSlug` sem garantia de formato no contrato (mesma cautela já
 * aplicada desde a ADM-003/004) — `encodeURIComponent` em todo segmento
 * dinâmico de URL, tanto de rota do Admin quanto de chamada à API.
 *
 * Os 3 valores do filtro mapeiam exatamente os 3 estados que
 * `listCategoriesQuerySchema` já suporta (`archived` ausente/`"false"`/
 * `"true"`) — nenhum valor novo.
 */
function buildListPath(siteSlug: string, page: number, filter: ArchivedFilter): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  if (filter === 'active') {
    params.set('archived', 'false');
  } else if (filter === 'archived') {
    params.set('archived', 'true');
  }
  return `/admin/sites/${encodeURIComponent(siteSlug)}/categories?${params.toString()}`;
}

function categoryHref(siteSlug: string, categoryId: string): string {
  return `/${encodeURIComponent(siteSlug)}/categories/${encodeURIComponent(categoryId)}`;
}

export function CategoryList({ siteSlug }: CategoryListProps) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ArchivedFilter>('all');
  const [state, setState] = useState<ListState>({ status: 'loading' });

  /**
   * O reset para `'loading'` acontece nos próprios handlers de evento
   * (`handlePageChange`/`handleFilterChange`), nunca de forma síncrona no
   * corpo do efeito — `react-hooks/set-state-in-effect` proíbe
   * `setState(...)` síncrono logo no início do efeito (só é aceitável
   * dentro de callbacks assíncronos, como `.then`/`.catch` abaixo). O
   * estado inicial de montagem já nasce `'loading'` (valor inicial do
   * `useState`), então o efeito não precisa repetir isso na primeira
   * execução.
   */
  useEffect(() => {
    let cancelled = false;

    apiRequest(buildListPath(siteSlug, page, filter), listCategoriesResponseSchema)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: resolveErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, page, filter]);

  function handlePageChange(nextPage: number) {
    setState({ status: 'loading' });
    setPage(nextPage);
  }

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    setState({ status: 'loading' });
    setFilter(event.target.value as ArchivedFilter);
    setPage(1);
  }

  return (
    <div className={styles.list}>
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor="archived-filter">Status</label>
          <select id="archived-filter" value={filter} onChange={handleFilterChange}>
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="archived">Arquivadas</option>
          </select>
        </div>
        <Link href={`/${encodeURIComponent(siteSlug)}/categories/new`}>Nova Categoria</Link>
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
            <p className={styles.status}>Nenhuma Categoria encontrada.</p>
          ) : (
            <ul className={styles.items}>
              {state.data.items.map((category) => (
                <li key={category.id}>
                  <Link href={categoryHref(siteSlug, category.id)}>
                    {category.name}
                    {category.archivedAt ? ' (arquivada)' : ''}
                  </Link>
                </li>
              ))}
            </ul>
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
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= state.data.totalPages}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </div>
  );
}
