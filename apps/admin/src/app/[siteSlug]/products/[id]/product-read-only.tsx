'use client';

import { useEffect, useState } from 'react';
import { Text } from '@commerce-platform/ui';
import type { CategoryAdmin, ProductDetailAdmin } from '@commerce-platform/contracts';
import { fetchAllCategories } from '../../../../lib/fetch-all-categories';
import { ErrorState, LoadingState } from '../../async-state';

interface ProductReadOnlyProps {
  siteSlug: string;
  product: ProductDetailAdmin;
}

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_CATEGORY_ERROR_MESSAGE = 'Não foi possível carregar a Categoria.';
const NO_CATEGORY_LABEL = 'Sem categoria';
const NO_DESCRIPTION_LABEL = 'Sem descrição';
const NO_IMAGE_LABEL = 'Sem imagem';
const ACTIVE_LABEL = 'Ativo';
const ARCHIVED_LABEL = 'Arquivado';

/**
 * Mesmo critério de apresentação de valor nulo já usado em `ArticleReadOnly`
 * (ADM-010) — só rótulo de exibição, nenhuma regra de domínio nova.
 */
function resolveCategoryLabel(product: ProductDetailAdmin, state: CategoriesState): string | null {
  if (product.categoryId === null) {
    return NO_CATEGORY_LABEL;
  }
  if (state.status !== 'ready') {
    return null;
  }
  const category = state.items.find((item) => item.id === product.categoryId);
  return category ? `${category.name}${category.archivedAt ? ' (arquivada)' : ''}` : product.categoryId;
}

/**
 * Composição somente leitura de Produto (ADM-012), usada quando a Role do
 * usuário no Site atual é `VIEWER` — mesmo princípio de `ArticleReadOnly`/
 * `CategoryReadOnly`: nenhum `<input>`, nenhum botão de ciclo de vida.
 *
 * Resolve Categoria com o mesmo `fetchAllCategories` já usado por
 * `ProductForm`/`ArticleReadOnly` — busca própria, dono único do dado
 * exibido aqui (mesmo critério já estabelecido, não uma novidade).
 *
 * `OfferSection` continua sendo renderizado por `ProductDetail`, fora
 * deste componente — ela já trata sua própria visibilidade por Role.
 *
 * UXA-013 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system, mesmo padrão de `CategoryReadOnly` (UXA-005):
 * `<h1>`/`<dl>`/`<dt>`/`<dd>` permanecem HTML nativo com classes Tailwind
 * locais — `Text` (`packages/ui`) só suporta `p`/`span`, não representa
 * nenhum destes elementos semânticos. `text-lg` é usado como exceção
 * sancionada, mesmo critério já registrado em `CategoryReadOnly`. Estado
 * de carregamento/erro da Categoria usa `LoadingState`/`ErrorState`
 * (`../../async-state`) em vez do rótulo textual inline anterior — mesmo
 * vocabulário de estados assíncronos já usado no restante da tela.
 */
export function ProductReadOnly({ siteSlug, product }: ProductReadOnlyProps) {
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchAllCategories(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCategoriesState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoriesState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  const categoryLabel = resolveCategoryLabel(product, categoriesState);

  return (
    <div className="flex max-w-xs flex-col gap-6">
      <h1 className="m-0 font-ui text-lg">{product.name}</h1>

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-ui font-action">Slug</dt>
        <dd className="m-0 font-ui">{product.slug}</dd>

        <dt className="font-ui font-action">Categoria</dt>
        <dd className="m-0 font-ui">
          {categoryLabel !== null ? (
            categoryLabel
          ) : categoriesState.status === 'error' ? (
            <ErrorState>{GENERIC_CATEGORY_ERROR_MESSAGE}</ErrorState>
          ) : (
            <LoadingState>Carregando...</LoadingState>
          )}
        </dd>

        <dt className="font-ui font-action">Status</dt>
        <dd className="m-0 font-ui">{product.archivedAt ? ARCHIVED_LABEL : ACTIVE_LABEL}</dd>

        <dt className="font-ui font-action">Descrição</dt>
        <dd className="m-0 font-ui">{product.description ?? NO_DESCRIPTION_LABEL}</dd>
      </dl>

      <div className="flex flex-col gap-1">
        <span className="font-ui text-body-sm font-action">Imagem</span>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt="Imagem do Produto"
            className="max-w-[240px] rounded-control border border-outline"
          />
        ) : (
          <Text className="m-0">{NO_IMAGE_LABEL}</Text>
        )}
      </div>
    </div>
  );
}
