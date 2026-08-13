'use client';

import { useEffect, useState } from 'react';
import { articleProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { fetchAllProducts } from '../../../../lib/fetch-all-products';
import styles from './article-products-section.module.css';

interface ArticleProductsSectionProps {
  siteSlug: string;
  articleId: string;
  onProductsChanged?: () => void;
}

type ProductIdsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; productIds: string[] };
type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ProductAdmin[] };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar os Produtos vinculados.';
const GENERIC_ACTION_ERROR_MESSAGE = 'Não foi possível concluir a ação. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

function productsPath(siteSlug: string, articleId: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}/products`;
}

function resolveActionErrorMessage(error: unknown): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return GENERIC_ACTION_ERROR_MESSAGE;
}

/**
 * Seção de vínculo de Produtos do Artigo (`EDT-010`) — só existe em
 * `ArticleDetail`, quando `status === 'DRAFT'` (nunca em `/new`, que ainda
 * não tem `articleId`; mesmo critério de `OfferSection`, que só aparece em
 * `ProductDetail [id]`).
 *
 * Duas buscas independentes ao montar: `GET /:id/products` (incremento
 * ADM-009, `productIds` na ordem de `position`) e `fetchAllProducts`
 * (catálogo completo do Site, nova função irmã de `fetchAllCategories`/
 * `fetchAllAuthors`) — a segunda resolve nome por `productId` sem nenhuma
 * chamada extra e também alimenta o `<select>` de "disponíveis"
 * (catálogo inteiro menos os já vinculados). Produto arquivado aparece
 * rotulado "(arquivado)" mas continua selecionável — `EDT-010` não
 * bloqueia isso; só a publicação (`APP-002`, fora do escopo) exige Oferta
 * válida.
 *
 * A ordem exibida (`productIds`) é SEMPRE substituída pela resposta da
 * API — no carregamento inicial e depois de cada vincular/desvincular/
 * reordenar (as três mutações de `EDT-010` já devolvem `{ productIds }`
 * atualizado). Nunca calculada ou persistida localmente além da confirmação
 * do servidor.
 *
 * Reordenar via botões "Mover para cima"/"Mover para baixo" — sem
 * drag-and-drop, sem nova dependência (decisão fechada no desenho técnico
 * da ADM-009).
 *
 * `onProductsChanged` (opcional, ADM-011) — chamado só após vincular ou
 * desvincular com sucesso, nunca em falha e nunca em reordenar (a ordem
 * não é uma das condições de `/health`). Este componente continua sem
 * conhecer `/health`: só comunica sucesso ao orquestrador
 * (`ArticleDetail`), que decide o que fazer com isso.
 */
export function ArticleProductsSection({ siteSlug, articleId, onProductsChanged }: ArticleProductsSectionProps) {
  const [productIdsState, setProductIdsState] = useState<ProductIdsState>({ status: 'loading' });
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' });
  const [selectedToLink, setSelectedToLink] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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

  async function handleLink() {
    if (!selectedToLink || isProcessing) {
      return;
    }
    setActionError(null);
    setIsProcessing(true);
    try {
      const response = await apiRequest(productsPath(siteSlug, articleId), articleProductsResponseSchema, {
        method: 'POST',
        body: { productId: selectedToLink },
      });
      setProductIdsState({ status: 'ready', productIds: response.productIds });
      setSelectedToLink('');
      onProductsChanged?.();
    } catch (error) {
      setActionError(resolveActionErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUnlink(productId: string) {
    if (isProcessing) {
      return;
    }
    setActionError(null);
    setIsProcessing(true);
    try {
      const response = await apiRequest(
        `${productsPath(siteSlug, articleId)}/${encodeURIComponent(productId)}`,
        articleProductsResponseSchema,
        { method: 'DELETE' },
      );
      setProductIdsState({ status: 'ready', productIds: response.productIds });
      onProductsChanged?.();
    } catch (error) {
      setActionError(resolveActionErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (isProcessing || productIdsState.status !== 'ready') {
      return;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= productIdsState.productIds.length) {
      return;
    }

    const reordered = [...productIdsState.productIds];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved!);

    setActionError(null);
    setIsProcessing(true);
    try {
      const response = await apiRequest(`${productsPath(siteSlug, articleId)}/reorder`, articleProductsResponseSchema, {
        method: 'PATCH',
        body: { productIds: reordered },
      });
      setProductIdsState({ status: 'ready', productIds: response.productIds });
    } catch (error) {
      setActionError(resolveActionErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

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
  const availableProducts = catalogState.items.filter((product) => !productIdsState.productIds.includes(product.id));

  return (
    <div className={styles.section}>
      <h2>Produtos vinculados</h2>

      {linkedProducts.length === 0 ? (
        <p className={styles.status}>Nenhum Produto vinculado.</p>
      ) : (
        <ul className={styles.items}>
          {linkedProducts.map((product, index) => (
            <li key={product.id} className={styles.item}>
              <span>
                {product.name}
                {product.archivedAt ? ' (arquivado)' : ''}
              </span>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={isProcessing || index === 0}
                  aria-label={`Mover ${product.name} para cima`}
                >
                  Mover para cima
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={isProcessing || index === linkedProducts.length - 1}
                  aria-label={`Mover ${product.name} para baixo`}
                >
                  Mover para baixo
                </button>
                <button type="button" onClick={() => handleUnlink(product.id)} disabled={isProcessing}>
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addField}>
        <label htmlFor="article-add-product">Adicionar Produto</label>
        <select
          id="article-add-product"
          value={selectedToLink}
          onChange={(event) => setSelectedToLink(event.target.value)}
          disabled={isProcessing}
        >
          <option value="">Selecione um Produto</option>
          {availableProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.archivedAt ? ' (arquivado)' : ''}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleLink} disabled={isProcessing || !selectedToLink}>
          Vincular
        </button>
      </div>

      {actionError && (
        <p role="alert" className={styles.status}>
          {actionError}
        </p>
      )}
    </div>
  );
}
