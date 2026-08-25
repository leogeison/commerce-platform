'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Button, Text } from '@commerce-platform/ui';
import { listCategoriesResponseSchema, type ListCategoriesResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { useSiteRole } from '../site-role-context';
import { EmptyState, ErrorState, LoadingState } from '../async-state';

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

/**
 * UXA-005 — apresentação migrada de CSS Module para Tailwind v4 + tokens do
 * design system. `<select>` permanece HTML nativo com classes Tailwind
 * locais (sem primitive de campo em `packages/ui` nesta tarefa). Os botões
 * de paginação passam a usar `Button` (`variant="secondary" size="sm"`):
 * preservam `type="button"`, `onClick` e `disabled` originais; o texto
 * "Página X de Y" passa a usar `Text as="span"` para herdar a tipografia do
 * design system. O link "Nova Categoria" não é tocado — nunca teve estilo
 * próprio no CSS Module original.
 */
export function CategoryList({ siteSlug }: CategoryListProps) {
  const role = useSiteRole();
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
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
        {roleMeetsMinimum(role, 'EDITOR') && (
          <Link href={`/${encodeURIComponent(siteSlug)}/categories/new`}>Nova Categoria</Link>
        )}
      </div>

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <EmptyState>Nenhuma Categoria encontrada.</EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
