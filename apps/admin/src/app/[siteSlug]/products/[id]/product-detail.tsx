'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { productDetailAdminSchema, type ProductDetailAdmin, type UpdateProductRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { ProductForm, type ProductFormValues } from '../product-form';
import { OfferSection } from './offer-section';
import styles from './product-detail.module.css';

interface ProductDetailProps {
  siteSlug: string;
  id: string;
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; product: ProductDetailAdmin };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar este Produto. Tente novamente em instantes.';
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

function productPath(siteSlug: string, id: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(id)}`;
}

/**
 * `/:siteSlug/products/:id` (ADM-006) — concentra carregamento, edição
 * (via `ProductForm` compartilhado, `PATCH` com `null` explícito nos
 * campos limpos), arquivar/desarquivar, exclusão e a seção de Ofertas
 * embutida (`OfferSection`). Nenhuma rota de detalhe separada, nenhuma
 * rota própria de Oferta — não existem no mapa de páginas (§32).
 *
 * Nenhuma visibilidade condicional por Role: os controles de ciclo de
 * vida ficam sempre visíveis (ADM-012 filtra isso depois, em todas as
 * telas de uma vez). A API continua sendo a autoridade real.
 */
export function ProductDetail({ siteSlug, id }: ProductDetailProps) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessingLifecycle, setIsProcessingLifecycle] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest(productPath(siteSlug, id), productDetailAdminSchema)
      .then((product) => {
        if (!cancelled) {
          setState({ status: 'ready', product });
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

  async function handleUpdate(values: ProductFormValues) {
    const body: UpdateProductRequest = {
      name: values.name,
      slug: values.slug,
      categoryId: values.categoryId,
      description: values.description,
      imageUrl: values.imageUrl,
    };

    const product = await apiRequest(productPath(siteSlug, id), productDetailAdminSchema, {
      method: 'PATCH',
      body,
    });
    setState({ status: 'ready', product });
  }

  async function handleArchiveToggle(action: 'archive' | 'unarchive') {
    if (isProcessingLifecycle) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      const product = await apiRequest(`${productPath(siteSlug, id)}/${action}`, productDetailAdminSchema, {
        method: 'POST',
      });
      setState({ status: 'ready', product });
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
    if (!window.confirm('Excluir este Produto? Esta ação não pode ser desfeita.')) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      await apiRequest(productPath(siteSlug, id), z.void(), { method: 'DELETE' });
      router.replace(`/${encodeURIComponent(siteSlug)}/products`);
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

  const { product } = state;

  return (
    <div className={styles.detail}>
      <ProductForm
        siteSlug={siteSlug}
        initialValues={{
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          description: product.description,
          imageUrl: product.imageUrl,
        }}
        submitLabel="Salvar"
        onSubmit={handleUpdate}
      />

      <div className={styles.actions}>
        {product.archivedAt ? (
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

      <OfferSection siteSlug={siteSlug} productId={id} />
    </div>
  );
}
