'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { productAdminSchema, type CreateProductRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { useToast } from '../../toast-context';
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
 * body aqui, nunca enviados como `null` na criação. Este mapeamento não
 * muda com UXA-013: `ProductFormValues` continua com a mesma forma
 * (`categoryId`/`description`/`imageUrl` nuláveis), independente de como
 * `ProductForm` valida internamente.
 *
 * UXA-013 — réplica exata do padrão já provado em `create-category.tsx`
 * (UXA-003/UXA-004): a navegação para `/:siteSlug/products/:id` foi movida
 * para `onSuccess` — `handleSubmit` (=`onSubmit`) só persiste e guarda o
 * `id` retornado num `ref`, nunca navega diretamente. `ProductForm` só
 * chama `onSuccess` depois que `reset(data)` já estabeleceu o novo
 * baseline (formulário limpo, `isDirty` volta a `false`) internamente na
 * RHF — é por isso que a criação bem-sucedida não dispara o guard de
 * "alterações não salvas" ao navegar para o detalhe logo em seguida.
 * `router.replace` (não `push`): evita que "voltar" leve de novo ao
 * formulário de criação vazio.
 *
 * `showToast('Produto salvo.')` (UXA-004) é chamado no mesmo `onSuccess`,
 * antes do `router.replace` — a ordem entre os dois não é observável
 * (ambos disparam a partir do mesmo evento síncrono), mas o toast
 * sobrevive à navegação porque `ToastProvider` está montado em
 * `layout.tsx`, acima da árvore roteada: `router.replace` desmonta este
 * componente, nunca o Provider.
 */
export function CreateProduct({ siteSlug }: CreateProductProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const createdIdRef = useRef<string | null>(null);

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
    createdIdRef.current = product.id;
  }

  function handleSuccess() {
    const id = createdIdRef.current;
    if (!id) {
      return;
    }
    showToast('Produto salvo.');
    router.replace(`/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(id)}`);
  }

  return (
    <ProductForm
      siteSlug={siteSlug}
      initialValues={EMPTY_VALUES}
      submitLabel="Criar"
      onSubmit={handleSubmit}
      onSuccess={handleSuccess}
    />
  );
}
