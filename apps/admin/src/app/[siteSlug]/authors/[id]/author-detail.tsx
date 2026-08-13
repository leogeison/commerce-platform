'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { authorAdminSchema, type AuthorAdmin, type UpdateAuthorRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { AuthorForm, type AuthorFormValues } from '../author-form';
import styles from './author-detail.module.css';

interface AuthorDetailProps {
  siteSlug: string;
  id: string;
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; author: AuthorAdmin };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar este Autor. Tente novamente em instantes.';
const GENERIC_ACTION_ERROR_MESSAGE = 'Não foi possível concluir esta ação. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

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

function authorPath(siteSlug: string, id: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/authors/${encodeURIComponent(id)}`;
}

/**
 * `/:siteSlug/authors/:id` (ADM-007) — concentra carregamento, edição (via
 * `AuthorForm` compartilhado) e exclusão. Sem arquivar/desarquivar: Author
 * não tem esse ciclo de vida (confirmado em `authorAdminSchema`/schema
 * Prisma — sem `archivedAt`), diferente de Categoria/Produto/Oferta.
 * Nenhuma rota de detalhe separada (não existe no mapa de páginas, §32).
 *
 * `handleUpdate` monta o body do PATCH só com `name`/`bio`/`avatarUrl` —
 * `userId` nunca é referenciado em nenhum ponto deste arquivo, então a
 * chave simplesmente não existe no objeto enviado. Isso preserva qualquer
 * vínculo Author↔User já existente: `updateAuthorRequestSchema` trata
 * `userId` ausente como "não alterar", nunca como "desvincular" (só um
 * `userId: null` explícito faria isso, e este código nunca produz isso).
 *
 * Nenhuma visibilidade condicional por Role: o botão de exclusão fica
 * sempre visível (ADM-012 é quem filtra isso depois, em todas as telas de
 * uma vez). A API continua sendo a autoridade real.
 */
export function AuthorDetail({ siteSlug, id }: AuthorDetailProps) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessingLifecycle, setIsProcessingLifecycle] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest(authorPath(siteSlug, id), authorAdminSchema)
      .then((author) => {
        if (!cancelled) {
          setState({ status: 'ready', author });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: resolveErrorMessage(error, GENERIC_LOAD_ERROR_MESSAGE) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, id]);

  async function handleUpdate(values: AuthorFormValues) {
    const body: UpdateAuthorRequest = {
      name: values.name,
      bio: values.bio,
      avatarUrl: values.avatarUrl,
    };

    const author = await apiRequest(authorPath(siteSlug, id), authorAdminSchema, {
      method: 'PATCH',
      body,
    });
    setState({ status: 'ready', author });
  }

  async function handleDelete() {
    if (isProcessingLifecycle) {
      return;
    }
    if (!window.confirm('Excluir este Autor? Esta ação não pode ser desfeita.')) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      await apiRequest(authorPath(siteSlug, id), z.void(), { method: 'DELETE' });
      router.replace(`/${encodeURIComponent(siteSlug)}/authors`);
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

  const { author } = state;

  return (
    <div className={styles.detail}>
      <AuthorForm
        siteSlug={siteSlug}
        initialValues={{ name: author.name, bio: author.bio, avatarUrl: author.avatarUrl }}
        submitLabel="Salvar"
        onSubmit={handleUpdate}
      />

      <div className={styles.actions}>
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
