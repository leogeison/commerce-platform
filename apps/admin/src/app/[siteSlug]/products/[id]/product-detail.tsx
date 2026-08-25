'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@commerce-platform/ui';
import {
  productAdminSchema,
  productDetailAdminSchema,
  type ProductAdmin,
  type ProductDetailAdmin,
  type UpdateProductRequest,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { roleMeetsMinimum } from '../../../../lib/role-hierarchy';
import { ErrorState, LoadingState } from '../../async-state';
import { useSiteRole } from '../../site-role-context';
import { useToast } from '../../toast-context';
import { ProductForm, type ProductFormValues } from '../product-form';
import { OfferSection } from './offer-section';
import { ProductReadOnly } from './product-read-only';

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
 * `PATCH .../products/:id` e `POST .../archive`|`.../unarchive` persistem
 * de fato (confirmado por investigação de causa raiz), mas devolvem
 * `ProductAdmin` "raso" — mesmo formato de `create()`/`list()`; só o `GET`
 * de detalhe inclui `offers` (`productDetailAdminSchema`). Antes desta
 * correção, as três chamadas validavam a resposta com
 * `productDetailAdminSchema`, que exige `offers` — a validação client-side
 * falhava depois da persistência já ter ocorrido no servidor, produzindo
 * um erro falso na UI mesmo com o Produto salvo com sucesso.
 *
 * A correção não é validar a mutation com um schema mais permissivo e
 * perder `offers` do estado: `DetailState.ready.product` continua
 * `ProductDetailAdmin` (é o que `ProductReadOnly` espera, e é o retrato
 * real do recurso carregado pelo `GET`). Este helper incorpora o
 * `ProductAdmin` raso devolvido pela mutation sobre o `ProductDetailAdmin`
 * já carregado — nenhuma mutation de Produto altera `offers` (quem
 * gerencia Oferta é exclusivamente `OfferSection`, via seus próprios
 * endpoints `/offers`, com busca independente), então o merge nunca perde
 * nem envelhece esse campo.
 */
function mergeMutationResult(current: ProductDetailAdmin, mutated: ProductAdmin): ProductDetailAdmin {
  return { ...current, ...mutated };
}

/**
 * `/:siteSlug/products/:id` (ADM-006) — concentra carregamento, edição
 * (via `ProductForm` compartilhado, `PATCH` com `null` explícito nos
 * campos limpos), arquivar/desarquivar, exclusão e a seção de Ofertas
 * embutida (`OfferSection`, UXA-014 — intocada por esta tarefa). Nenhuma
 * rota de detalhe separada, nenhuma rota própria de Oferta — não existem
 * no mapa de páginas (§32).
 *
 * Visibilidade por Role (ADM-012): `VIEWER` vê `ProductReadOnly` — nunca
 * `ProductForm` (mesmo princípio de `CategoryDetail`/`ArticleReadOnly`).
 * `EDITOR`/`OWNER` veem `ProductForm`; só `OWNER` vê os botões Arquivar/
 * Desarquivar/Excluir. `OfferSection` continua renderizado nas duas
 * composições — ela trata sua própria visibilidade por Role internamente.
 * A API continua sendo a autoridade real.
 *
 * UXA-013 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system + primitives `Button` (`packages/ui`) e
 * `LoadingState`/`ErrorState` (`../../async-state`, promovido nesta
 * tarefa). `handleFormSuccess` (novo) dispara `showToast('Produto
 * salvo.')` depois que `ProductForm` já chamou `reset(data)` internamente
 * (mesma ordem já garantida para a criação) — mesmo padrão de
 * `CategoryDetail.handleFormSuccess` (UXA-004); a edição não navega em
 * lugar nenhum, então este é só o gatilho do toast, sem nenhuma outra
 * consequência.
 */
export function ProductDetail({ siteSlug, id }: ProductDetailProps) {
  const router = useRouter();
  const role = useSiteRole();
  const { showToast } = useToast();
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

    const mutated = await apiRequest(productPath(siteSlug, id), productAdminSchema, {
      method: 'PATCH',
      body,
    });
    setState((prev) =>
      prev.status === 'ready' ? { status: 'ready', product: mergeMutationResult(prev.product, mutated) } : prev,
    );
  }

  function handleFormSuccess() {
    showToast('Produto salvo.');
  }

  async function handleArchiveToggle(action: 'archive' | 'unarchive') {
    if (isProcessingLifecycle) {
      return;
    }
    setIsProcessingLifecycle(true);
    setActionError(null);
    try {
      const mutated = await apiRequest(`${productPath(siteSlug, id)}/${action}`, productAdminSchema, {
        method: 'POST',
      });
      setState((prev) =>
        prev.status === 'ready' ? { status: 'ready', product: mergeMutationResult(prev.product, mutated) } : prev,
      );
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
    return <LoadingState>Carregando...</LoadingState>;
  }

  if (state.status === 'error') {
    return <ErrorState>{state.message}</ErrorState>;
  }

  const { product } = state;

  if (!roleMeetsMinimum(role, 'EDITOR')) {
    return (
      <div className="flex max-w-md flex-col gap-6">
        <ProductReadOnly siteSlug={siteSlug} product={product} />
        <OfferSection siteSlug={siteSlug} productId={id} />
      </div>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
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
        onSuccess={handleFormSuccess}
      />

      {roleMeetsMinimum(role, 'OWNER') && (
        <div className="flex gap-3">
          {product.archivedAt ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleArchiveToggle('unarchive')}
              disabled={isProcessingLifecycle}
            >
              Desarquivar
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleArchiveToggle('archive')}
              disabled={isProcessingLifecycle}
            >
              Arquivar
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={handleDelete} disabled={isProcessingLifecycle}>
            Excluir
          </Button>
        </div>
      )}

      {actionError && <ErrorState>{actionError}</ErrorState>}

      <OfferSection siteSlug={siteSlug} productId={id} />
    </div>
  );
}
