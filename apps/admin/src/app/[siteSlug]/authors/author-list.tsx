'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listAuthorsResponseSchema, type ListAuthorsResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { useSiteRole } from '../site-role-context';
import styles from './author-list.module.css';

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
 * Categoria/Produto) — só `page`/`pageSize`.
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
    <div className={styles.list}>
      <div className={styles.toolbar}>
        {roleMeetsMinimum(role, 'EDITOR') && (
          <Link href={`/${encodeURIComponent(siteSlug)}/authors/new`}>Novo Autor</Link>
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
            <p className={styles.status}>Nenhum Autor encontrado.</p>
          ) : (
            <ul className={styles.items}>
              {state.data.items.map((author) => (
                <li key={author.id}>
                  <Link href={authorHref(siteSlug, author.id)}>{author.name}</Link>
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
