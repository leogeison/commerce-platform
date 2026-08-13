'use client';

import { useRouter } from 'next/navigation';
import { productAdminSchema, type CreateProductRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { ProductForm, type ProductFormValues } from '../product-form';

interface CreateProductProps {
  siteSlug: string;
}

const EMPTY_VALUES: ProductFormValues = {
  name: '',
  slug: '',
  categoryId: null,
  description: null,
  imageUrl: null,
};

/**
 * `POST /admin/sites/:siteSlug/products` (ADM-006). `createProductRequestSchema`
 * não aceita `null` em `categoryId`/`description`/`imageUrl` — só omitido
 * ou valor — então campos `null` vindos do `ProductForm` são removidos do
 * body aqui, nunca enviados como `null` na criação.
 */
export function CreateProduct({ siteSlug }: CreateProductProps) {
  const router = useRouter();

  async function handleSubmit(values: ProductFormValues) {
    const body: CreateProductRequest = {
      name: values.name,
      slug: values.slug,
      ...(values.categoryId !== null ? { categoryId: values.categoryId } : {}),
      ...(values.description !== null ? { description: values.description } : {}),
      ...(values.imageUrl !== null ? { imageUrl: values.imageUrl } : {}),
    };

    const product = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/products`,
      productAdminSchema,
      { method: 'POST', body },
    );

    router.replace(`/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(product.id)}`);
  }

  return <ProductForm siteSlug={siteSlug} initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={handleSubmit} />;
}
