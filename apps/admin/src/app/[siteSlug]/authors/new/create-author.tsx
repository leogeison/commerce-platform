'use client';

import { useRouter } from 'next/navigation';
import { authorAdminSchema, type CreateAuthorRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AuthorForm, type AuthorFormValues } from '../author-form';

interface CreateAuthorProps {
  siteSlug: string;
}

const EMPTY_VALUES: AuthorFormValues = {
  name: '',
  bio: null,
  avatarUrl: null,
};

/**
 * `POST /admin/sites/:siteSlug/authors` (ADM-007). `createAuthorRequestSchema`
 * não aceita `null` em `bio`/`avatarUrl` — só omitido ou valor — então
 * campos `null` vindos do `AuthorForm` são removidos do body aqui, nunca
 * enviados como `null` na criação. `userId` nunca é incluído: resultado é
 * sempre um Author convidado (decisão explícita da ADM-007 — vínculo com
 * `User` fica fora desta tarefa).
 */
export function CreateAuthor({ siteSlug }: CreateAuthorProps) {
  const router = useRouter();

  async function handleSubmit(values: AuthorFormValues) {
    const body: CreateAuthorRequest = {
      name: values.name,
      ...(values.bio !== null ? { bio: values.bio } : {}),
      ...(values.avatarUrl !== null ? { avatarUrl: values.avatarUrl } : {}),
    };

    const author = await apiRequest(`/admin/sites/${encodeURIComponent(siteSlug)}/authors`, authorAdminSchema, {
      method: 'POST',
      body,
    });

    router.replace(`/${encodeURIComponent(siteSlug)}/authors/${encodeURIComponent(author.id)}`);
  }

  return <AuthorForm siteSlug={siteSlug} initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={handleSubmit} />;
}
