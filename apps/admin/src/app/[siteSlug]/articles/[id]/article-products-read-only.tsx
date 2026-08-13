'use client';

import { useEffect, useState } from 'react';
import { articleProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { fetchAllProducts } from '../../../../lib/fetch-all-products';
import styles from './article-products-read-only.module.css';

interface ArticleProductsReadOnlyProps {
  siteSlug: string;
  articleId: string;
}

type ProductIdsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; productIds: string[] };
type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ProductAdmin[] };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar os Produtos vinculados.';

function productsPath(siteSlug: string, articleId: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}/products`;
}

/**
 * Lista somente leitura de Produtos vinculados (ADM-010), usada quando
 * `status !== 'DRAFT'` — mesmos dois dados de `ArticleProductsSection`
 * (`GET :id/products`, ADM-009, + `fetchAllProducts` para resolver nome),
 * sem nenhum controle de vincular/desvincular/reordenar
 * (Architecture.md §14: "vincular/desvincular/reordenar Produto num Artigo
 * só é permitido em DRAFT").
 *
 * Duplica deliberadamente o pequeno bloco de busca/resolução de
 * `ArticleProductsSection` (os dois `useEffect`, o `Map` de nome por id,
 * ~70 linhas) — duplicação pequena e localizada, inspecionada e aceita no
 * desenho técnico da ADM-010, em vez de extrair uma abstração sem um
 * terceiro uso real. `ArticleProductsSection` permanece inteiramente
 * inalterado.
 */
export function ArticleProductsReadOnly({ siteSlug, articleId }: ArticleProductsReadOnlyProps) {
  const [productIdsState, setProductIdsState] = useState<ProductIdsState>({ status: 'loading' });
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest(productsPath(siteSlug, articleId), articleProductsResponseSchema)
      .then((data) => {
        if (!cancelled) {
          setProductIdsState({ status: 'ready', productIds: data.productIds });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProductIdsState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, articleId]);

  useEffect(() => {
    let cancelled = false;

    fetchAllProducts(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCatalogState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  if (productIdsState.status === 'loading' || catalogState.status === 'loading') {
    return (
      <div className={styles.section}>
        <h2>Produtos vinculados</h2>
        <p className={styles.status}>Carregando Produtos vinculados...</p>
      </div>
    );
  }

  if (productIdsState.status === 'error' || catalogState.status === 'error') {
    return (
      <div className={styles.section}>
        <h2>Produtos vinculados</h2>
        <p role="alert" className={styles.status}>
          {GENERIC_LOAD_ERROR_MESSAGE}
        </p>
      </div>
    );
  }

  const productMap = new Map(catalogState.items.map((product) => [product.id, product]));
  const linkedProducts = productIdsState.productIds
    .map((id) => productMap.get(id))
    .filter((product): product is ProductAdmin => product !== undefined);

  return (
    <div className={styles.section}>
      <h2>Produtos vinculados</h2>

      {linkedProducts.length === 0 ? (
        <p className={styles.status}>Nenhum Produto vinculado.</p>
      ) : (
        <ul className={styles.items}>
          {linkedProducts.map((product) => (
            <li key={product.id} className={styles.item}>
              {product.name}
              {product.archivedAt ? ' (arquivado)' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
