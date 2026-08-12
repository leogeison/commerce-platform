'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { categoryAdminSchema, type CategoryAdmin, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { CategoryForm } from '../category-form';
import styles from './category-detail.module.css';

interface CategoryDetailProps {
  siteSlug: string;
  id: string;
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; category: CategoryAdmin };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar esta Categoria. Tente novamente em instantes.';
const GENERIC_ACTION_ERROR_MESSAGE = 'Não foi possível concluir esta ação. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Mesma cautela defensiva do `CategoryForm`: só repassa `error.message` da
 * API para status que representam decisão de negócio real
 * (`403`/`404`/`409`/`422`) — rede, resposta inválida e `500` inesperado
 * sempre caem na mensagem genérica informada por quem chama.
 */
function resolveErrorMessage(error: unknown, generic: string): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return generic;
}

function categoryPath(siteSlug: string, id: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/categories/${encodeURIComponent(id)}`;
}

/**
 * `/:siteSlug/categories/:id` (ADM-005) — concentra carregamento, edição
 * (via `CategoryForm` compartilhado), arquivar/desarquivar e exclusão.
 * Nenhuma rota de detalhe separada (não existe no mapa de páginas, §32).
 *
 * Nenhuma visibilidade condicional por Role: os três botões de ciclo de
 * vida ficam sempre visíveis (decisão explícita — ADM-012 é quem filtra
 * isso depois, em todas as telas de uma vez). A API continua sendo a
 * autoridade real; uma tentativa sem Role suficiente volta como `403`,
 * tratado pelo mesmo caminho genérico de erro.
 */
export function CategoryDetail({ siteSlug, id }: CategoryDetailProps) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessingLifecycle, setIsProcessingLifecycle] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest(categoryPath(siteSlug, id), categoryAdminSchema)
      .then((category) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', category });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: resolveErrorMessage(error, GENERIC_LOAD_ERROR_MESSAGE) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, id]);

  async function handleUpdate(values: CreateCategoryRequest) {
    const category = await apiRequest(categoryPath(siteSlug, id), categoryAdminSchema, {
      method: 'PATCH',
      body: values,
    });
    setState({ status: 'ready', category });
  }

  async function handleArchiveToggle(action: 'archive' | 'unarchive') {
    if (isProcessingLifecycle) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      const category = await apiRequest(`${categoryPath(siteSlug, id)}/${action}`, categoryAdminSchema, {
        method: 'POST',
      });
      setState({ status: 'ready', category });
    } catch (error) {
      setActionError(resolveErrorMessage(error, GENERIC_ACTION_ERROR_MESSAGE));
    } finally {
      setIsProcessingLifecycle(false);
    }
  }

  async function handleDelete() {
    if (isProcessingLifecycle) {
      return;
    }
    if (!window.confirm('Excluir esta Categoria? Esta ação não pode ser desfeita.')) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      await apiRequest(categoryPath(siteSlug, id), z.void(), { method: 'DELETE' });
      router.replace(`/${encodeURIComponent(siteSlug)}/categories`);
    } catch (error) {
      setActionError(resolveErrorMessage(error, GENERIC_ACTION_ERROR_MESSAGE));
      setIsProcessingLifecycle(false);
    }
  }

  if (state.status === 'loading') {
    return <p className={styles.status}>Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className={styles.status}>
        {state.message}
      </p>
    );
  }

  const { category } = state;

  return (
    <div className={styles.detail}>
      <CategoryForm
        initialValues={{ name: category.name, slug: category.slug }}
        submitLabel="Salvar"
        onSubmit={handleUpdate}
      />

      <div className={styles.actions}>
        {category.archivedAt ? (
          <button type="button" onClick={() => handleArchiveToggle('unarchive')} disabled={isProcessingLifecycle}>
            Desarquivar
          </button>
        ) : (
          <button type="button" onClick={() => handleArchiveToggle('archive')} disabled={isProcessingLifecycle}>
            Arquivar
          </button>
        )}
        <button type="button" onClick={handleDelete} disabled={isProcessingLifecycle}>
          Excluir
        </button>
      </div>

      {actionError && (
        <p role="alert" className={styles.status}>
          {actionError}
        </p>
      )}
    </div>
  );
}
