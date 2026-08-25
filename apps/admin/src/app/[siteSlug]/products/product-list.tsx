'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Button, Text } from '@commerce-platform/ui';
import { listProductsResponseSchema, type CategoryAdmin, type ListProductsResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { fetchAllCategories } from '../../../lib/fetch-all-categories';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { EmptyState, ErrorState, LoadingState } from '../async-state';
import { useSiteRole } from '../site-role-context';

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
 * `listProductsQuerySchema` (`archived` ausente/`"false"`/`"true"`) —
 * nenhum valor novo.
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
 * UXA-013 — apresentação migrada de CSS Module para Tailwind v4 + tokens do
 * design system, mesmo vocabulário já usado em `CategoryList` (UXA-005):
 * `<select>` permanece HTML nativo com classes Tailwind locais; botões de
 * paginação usam `Button variant="secondary" size="sm"`; "Página X de Y"
 * usa `Text as="span"`; os três estados assíncronos usam
 * `LoadingState`/`ErrorState`/`EmptyState`, agora promovidos para
 * `../async-state` (ver doc comment do próprio módulo) — Produto é o
 * segundo consumidor real que justifica a promoção. O link "Novo Produto"
 * não é tocado — nunca teve estilo próprio no CSS Module original, mesmo
 * critério já usado em `CategoryList`.
 *
 * Filtro de Categoria mostra TODAS (ativas e arquivadas) — diferente do
 * vínculo no `ProductForm`: filtrar por uma Categoria arquivada é uma
 * consulta legítima (ex.: achar Produtos ainda ligados a ela), não um
 * vínculo novo a evitar. Comportamento inalterado por esta tarefa.
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="archived-filter" className="font-ui text-body-sm font-action">
              Status
            </label>
            <select
              id="archived-filter"
              value={filter}
              onChange={handleFilterChange}
              className="rounded-control border border-outline px-2 py-1.5 font-ui text-body-sm"
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="archived">Arquivadas</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="category-filter" className="font-ui text-body-sm font-action">
              Categoria
            </label>
            <select
              id="category-filter"
              value={categoryId}
              onChange={handleCategoryChange}
              disabled={categoriesState.status !== 'ready'}
              className="rounded-control border border-outline px-2 py-1.5 font-ui text-body-sm"
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

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <EmptyState>Nenhum Produto encontrado.</EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
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

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            {state.data.totalPages > 0 && (
              <Text as="span">
                Página {state.data.page} de {state.data.totalPages}
              </Text>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= state.data.totalPages}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
