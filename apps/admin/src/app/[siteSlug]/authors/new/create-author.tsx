'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authorAdminSchema, type CreateAuthorRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { useToast } from '../../toast-context';
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
 * enviados como `null` na criação (comportamento preservado da versão
 * anterior a esta tarefa). `userId` nunca é incluído: resultado é sempre
 * um Author convidado (decisão explícita da ADM-007 — vínculo com `User`
 * fica fora desta tarefa).
 *
 * UXA-015 — réplica exata do padrão já provado em `create-product.tsx`
 * (UXA-013): a navegação para `/:siteSlug/authors/:id` foi movida para
 * `onSuccess` — `handleSubmit` (=`onSubmit`) só persiste e guarda o `id`
 * retornado num `ref`, nunca navega diretamente. `AuthorForm` só chama
 * `onSuccess` depois que `reset(data)` já estabeleceu o novo baseline
 * (formulário limpo, `isDirty` volta a `false`) internamente na RHF — é
 * por isso que a criação bem-sucedida não dispara o guard de "alterações
 * não salvas" ao navegar para o detalhe logo em seguida. `router.replace`
 * (não `push`): evita que "voltar" leve de novo ao formulário de criação
 * vazio.
 *
 * `showToast('Autor salvo.')` é chamado no mesmo `onSuccess`, antes do
 * `router.replace` — mesma ordem/razão já documentada em
 * `create-product.tsx`: o toast sobrevive à navegação porque
 * `ToastProvider` está montado em `layout.tsx`, acima da árvore roteada.
 */
export function CreateAuthor({ siteSlug }: CreateAuthorProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const createdIdRef = useRef<string | null>(null);

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
    createdIdRef.current = author.id;
  }

  function handleSuccess() {
    const id = createdIdRef.current;
    if (!id) {
      return;
    }
    showToast('Autor salvo.');
    router.replace(`/${encodeURIComponent(siteSlug)}/authors/${encodeURIComponent(id)}`);
  }

  return (
    <AuthorForm
      siteSlug={siteSlug}
      initialValues={EMPTY_VALUES}
      submitLabel="Criar"
      onSubmit={handleSubmit}
      onSuccess={handleSuccess}
    />
  );
}
