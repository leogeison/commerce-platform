'use client';

import { useEffect, useState } from 'react';
import type { CategoryAdmin, ProductDetailAdmin } from '@commerce-platform/contracts';
import { fetchAllCategories } from '../../../../lib/fetch-all-categories';
import styles from './product-read-only.module.css';

interface ProductReadOnlyProps {
  siteSlug: string;
  product: ProductDetailAdmin;
}

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_CATEGORY_ERROR_MESSAGE = 'Não foi possível carregar a Categoria.';
const NO_CATEGORY_LABEL = 'Sem categoria';
const NO_DESCRIPTION_LABEL = 'Sem descrição';
const NO_IMAGE_LABEL = 'Sem imagem';
const LOADING_LABEL = 'Carregando...';
const ACTIVE_LABEL = 'Ativo';
const ARCHIVED_LABEL = 'Arquivado';

/**
 * Mesmo critério de apresentação de valor nulo já usado em `ArticleReadOnly`
 * (ADM-010) — só rótulo de exibição, nenhuma regra de domínio nova.
 */
function resolveCategoryLabel(product: ProductDetailAdmin, state: CategoriesState): string {
  if (product.categoryId === null) {
    return NO_CATEGORY_LABEL;
  }
  if (state.status === 'loading') {
    return LOADING_LABEL;
  }
  if (state.status === 'error') {
    return GENERIC_CATEGORY_ERROR_MESSAGE;
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

  return (
    <div className={styles.view}>
      <h1>{product.name}</h1>

      <dl className={styles.summary}>
        <dt>Slug</dt>
        <dd>{product.slug}</dd>

        <dt>Categoria</dt>
        <dd>{resolveCategoryLabel(product, categoriesState)}</dd>

        <dt>Status</dt>
        <dd>{product.archivedAt ? ARCHIVED_LABEL : ACTIVE_LABEL}</dd>

        <dt>Descrição</dt>
        <dd>{product.description ?? NO_DESCRIPTION_LABEL}</dd>
      </dl>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Imagem</span>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="Imagem do Produto" className={styles.image} />
        ) : (
          <p className={styles.status}>{NO_IMAGE_LABEL}</p>
        )}
      </div>
    </div>
  );
}
