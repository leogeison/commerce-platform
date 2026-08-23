'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { categoryAdminSchema, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { useToast } from '../../toast-context';
import { CategoryForm } from '../category-form';

interface CreateCategoryProps {
  siteSlug: string;
}

/**
 * `POST /admin/sites/:siteSlug/categories` (ADM-005). A navegação para
 * `/:siteSlug/categories/:id` foi movida para `onSuccess` (UXA-003):
 * `handleSubmit` (=`onSubmit`) só persiste e guarda o `id` retornado num
 * `ref` — não navega mais diretamente. `CategoryForm` só chama
 * `onSuccess` depois de `reset(data)` já ter estabelecido o novo baseline
 * (formulário limpo) internamente na RHF. `router.replace` (não `push`):
 * evita que "voltar" leve de novo ao formulário de criação vazio.
 *
 * `showToast` (UXA-004) é chamado no mesmo `onSuccess`, antes do
 * `router.replace` — a ordem entre os dois não é observável (ambos
 * disparam a partir do mesmo evento síncrono), mas o toast sobrevive à
 * navegação porque `ToastProvider` está montado em `layout.tsx`, acima da
 * árvore roteada: `router.replace` desmonta este componente, nunca o
 * Provider.
 */
export function CreateCategory({ siteSlug }: CreateCategoryProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const createdIdRef = useRef<string | null>(null);

  async function handleSubmit(values: CreateCategoryRequest) {
    const category = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/categories`,
      categoryAdminSchema,
      { method: 'POST', body: values },
    );
    createdIdRef.current = category.id;
  }

  function handleSuccess() {
    const id = createdIdRef.current;
    if (!id) {
      return;
    }
    showToast('Categoria salva.');
    router.replace(`/${encodeURIComponent(siteSlug)}/categories/${encodeURIComponent(id)}`);
  }

  return (
    <CategoryForm
      initialValues={{ name: '', slug: '' }}
      submitLabel="Criar"
      onSubmit={handleSubmit}
      onSuccess={handleSuccess}
    />
  );
}
