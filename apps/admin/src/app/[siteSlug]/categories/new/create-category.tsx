'use client';

import { useRouter } from 'next/navigation';
import { categoryAdminSchema, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { CategoryForm } from '../category-form';

interface CreateCategoryProps {
  siteSlug: string;
}

/**
 * `POST /admin/sites/:siteSlug/categories` (ADM-005). Sucesso navega para
 * `/:siteSlug/categories/:id` usando o `id` retornado pela própria API —
 * `router.replace` (não `push`): evita que "voltar" leve de novo ao
 * formulário de criação vazio.
 */
export function CreateCategory({ siteSlug }: CreateCategoryProps) {
  const router = useRouter();

  async function handleSubmit(values: CreateCategoryRequest) {
    const category = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/categories`,
      categoryAdminSchema,
      { method: 'POST', body: values },
    );

    router.replace(`/${encodeURIComponent(siteSlug)}/categories/${encodeURIComponent(category.id)}`);
  }

  return <CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={handleSubmit} />;
}
