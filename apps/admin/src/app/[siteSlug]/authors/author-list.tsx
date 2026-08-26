'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Text } from '@commerce-platform/ui';
import { listAuthorsResponseSchema, type ListAuthorsResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { useSiteRole } from '../site-role-context';
import { EmptyState, ErrorState, LoadingState } from '../async-state';

interface AuthorListProps {
  siteSlug: string;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListAuthorsResponse };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar os Autores. Tente novamente em instantes.';
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
 * aplicada desde a ADM-003) — `encodeURIComponent` em todo segmento
 * dinâmico de URL.
 *
 * Sem filtro nenhum (`listAuthorsQuerySchema`: "sem filtro", diferente de
 * Categoria/Produto) — só `page`/`pageSize`. Comportamento preservado, não
 * alterado por esta tarefa.
 */
function buildListPath(siteSlug: string, page: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  return `/admin/sites/${encodeURIComponent(siteSlug)}/authors?${params.toString()}`;
}

function authorHref(siteSlug: string, authorId: string): string {
  return `/${encodeURIComponent(siteSlug)}/authors/${encodeURIComponent(authorId)}`;
}

/**
 * UXA-015 — apresentação migrada de CSS Module para Tailwind v4 + tokens do
 * design system, mesmo vocabulário já usado em `CategoryList`/`ProductList`:
 * botões de paginação usam `Button` (`variant="secondary" size="sm"`),
 * preservando `type="button"`, `onClick` e `disabled` originais; "Página X
 * de Y" usa `Text as="span"`; os três estados assíncronos usam
 * `LoadingState`/`ErrorState`/`EmptyState` (`../async-state`). O link "Novo
 * Autor" não é tocado — nunca teve estilo próprio no CSS Module original,
 * mesmo critério já usado em `CategoryList`/`ProductList`. Sem filtro (ao
 * contrário de Categoria/Produto), então a barra de ferramentas só precisa
 * alinhar o link à direita, sem nenhum controle à esquerda.
 */
export function AuthorList({ siteSlug }: AuthorListProps) {
  const role = useSiteRole();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ListState>({ status: 'loading' });

  /**
   * O reset para `'loading'` acontece no próprio handler de evento
   * (`handlePageChange`), nunca de forma síncrona no corpo do efeito —
   * mesma regra já aplicada em `CategoryList`/`ProductList`
   * (`react-hooks/set-state-in-effect`). O estado inicial de montagem já
   * nasce `'loading'`.
   */
  useEffect(() => {
    let cancelled = false;

    apiRequest(buildListPath(siteSlug, page), listAuthorsResponseSchema)
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
  }, [siteSlug, page]);

  function handlePageChange(nextPage: number) {
    setState({ status: 'loading' });
    setPage(nextPage);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {roleMeetsMinimum(role, 'EDITOR') && (
          <Link href={`/${encodeURIComponent(siteSlug)}/authors/new`}>Novo Autor</Link>
        )}
      </div>

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <EmptyState>Nenhum Autor encontrado.</EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {state.data.items.map((author) => (
                <li key={author.id}>
                  <Link href={authorHref(siteSlug, author.id)}>{author.name}</Link>
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
