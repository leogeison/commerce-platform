'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { listProductsResponseSchema, type CategoryAdmin, type ListProductsResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { fetchAllCategories } from '../../../lib/fetch-all-categories';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { useSiteRole } from '../site-role-context';
import styles from './product-list.module.css';

interface ProductListProps {
  siteSlug: string;
}

type ArchivedFilter = 'all' | 'active' | 'archived';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListProductsResponse };

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar os Produtos. Tente novamente em instantes.';
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
 * `siteSlug`/`categoryId` sem garantia de formato fixa no contrato de rota
 * — `encodeURIComponent` em todo segmento dinâmico, mesma cautela da
 * ADM-003/004/005. Filtro Status mapeia os 3 estados de
 * `listCategoriesQuerySchema`/`listProductsQuerySchema` (`archived`
 * ausente/`"false"`/`"true"`) — nenhum valor novo.
 */
function buildListPath(siteSlug: string, page: number, filter: ArchivedFilter, categoryId: string): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  if (filter === 'active') {
    params.set('archived', 'false');
  } else if (filter === 'archived') {
    params.set('archived', 'true');
  }
  if (categoryId !== '') {
    params.set('categoryId', categoryId);
  }
  return `/admin/sites/${encodeURIComponent(siteSlug)}/products?${params.toString()}`;
}

function productHref(siteSlug: string, productId: string): string {
  return `/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(productId)}`;
}

/**
 * Filtro de Categoria mostra TODAS (ativas e arquivadas) — diferente do
 * vínculo no `ProductForm`: filtrar por uma Categoria arquivada é uma
 * consulta legítima (ex.: achar Produtos ainda ligados a ela), não um
 * vínculo novo a evitar.
 */
export function ProductList({ siteSlug }: ProductListProps) {
  const role = useSiteRole();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ArchivedFilter>('all');
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

    apiRequest(buildListPath(siteSlug, page, filter, categoryId), listProductsResponseSchema)
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
  }, [siteSlug, page, filter, categoryId]);

  function handlePageChange(nextPage: number) {
    setState({ status: 'loading' });
    setPage(nextPage);
  }

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    setState({ status: 'loading' });
    setFilter(event.target.value as ArchivedFilter);
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
            <label htmlFor="archived-filter">Status</label>
            <select id="archived-filter" value={filter} onChange={handleFilterChange}>
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="archived">Arquivadas</option>
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
          </div>
        </div>
        {roleMeetsMinimum(role, 'EDITOR') && (
          <Link href={`/${encodeURIComponent(siteSlug)}/products/new`}>Novo Produto</Link>
        )}
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
            <p className={styles.status}>Nenhum Produto encontrado.</p>
          ) : (
            <ul className={styles.items}>
              {state.data.items.map((product) => (
                <li key={product.id}>
                  <Link href={productHref(siteSlug, product.id)}>
                    {product.name}
                    {product.archivedAt ? ' (arquivado)' : ''}
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
