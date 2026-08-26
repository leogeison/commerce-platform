'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@commerce-platform/ui';
import { authorAdminSchema, type AuthorAdmin, type UpdateAuthorRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { roleMeetsMinimum } from '../../../../lib/role-hierarchy';
import { useSiteRole } from '../../site-role-context';
import { useToast } from '../../toast-context';
import { ErrorState, LoadingState } from '../../async-state';
import { AuthorForm, type AuthorFormValues } from '../author-form';
import { AuthorReadOnly } from './author-read-only';

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
 * não tem esse ciclo de vida (schema Prisma sem `archivedAt`), diferente
 * de Categoria/Produto/Oferta — comportamento preservado, não alterado por
 * esta tarefa.
 *
 * `handleUpdate` monta o body do PATCH só com `name`/`bio`/`avatarUrl` —
 * `userId` nunca é referenciado, preservando qualquer vínculo Author↔User
 * já existente (`updateAuthorRequestSchema` trata `userId` ausente como
 * "não alterar").
 *
 * Visibilidade por Role (ADM-012), preservada sem alteração: `VIEWER` vê
 * `AuthorReadOnly` — nunca `AuthorForm`. `EDITOR`/`OWNER` veem
 * `AuthorForm`; só `OWNER` vê o botão Excluir. A API continua sendo a
 * autoridade real.
 *
 * UXA-015 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system + `LoadingState`/`ErrorState` (`../../async-state`) +
 * `Button` (`packages/ui`). `handleFormSuccess` dispara
 * `showToast('Autor salvo.')` depois que `AuthorForm` já chamou `reset()`
 * internamente — mesmo padrão de `CategoryDetail`/`ProductDetail`
 * (`onSuccess`, nunca antes de `reset()`).
 */
export function AuthorDetail({ siteSlug, id }: AuthorDetailProps) {
  const router = useRouter();
  const role = useSiteRole();
  const { showToast } = useToast();
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

  function handleFormSuccess() {
    showToast('Autor salvo.');
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
    return <LoadingState>Carregando...</LoadingState>;
  }

  if (state.status === 'error') {
    return <ErrorState>{state.message}</ErrorState>;
  }

  const { author } = state;

  if (!roleMeetsMinimum(role, 'EDITOR')) {
    return <AuthorReadOnly author={author} />;
  }

  return (
    <div className="flex max-w-xs flex-col gap-6">
      <AuthorForm
        siteSlug={siteSlug}
        initialValues={{ name: author.name, bio: author.bio, avatarUrl: author.avatarUrl }}
        submitLabel="Salvar"
        onSubmit={handleUpdate}
        onSuccess={handleFormSuccess}
      />

      {roleMeetsMinimum(role, 'OWNER') && (
        <div className="flex gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={handleDelete} disabled={isProcessingLifecycle}>
            Excluir
          </Button>
        </div>
      )}

      {actionError && <ErrorState>{actionError}</ErrorState>}
    </div>
  );
}
