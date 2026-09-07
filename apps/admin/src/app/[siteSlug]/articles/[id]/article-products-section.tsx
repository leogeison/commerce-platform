'use client';

import { useState } from 'react';
import { articleProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { useProductLookup } from '../product-lookup-context';
import styles from './article-products-section.module.css';

interface ArticleProductsSectionProps {
  siteSlug: string;
  articleId: string;
  onProductsChanged?: () => void;
}

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
 * UXE-011 — REFATORAÇÃO: as duas buscas independentes que este componente
 * fazia ao montar (`GET /:id/products` e `fetchAllProducts`) foram movidas
 * para `ProductLookupProvider` (montado por `ArticleDetail`, acima deste
 * componente e de `ArticleForm`) — fonte agora compartilhada com o editor
 * Lexical do corpo do Artigo (menu `/`, decorator do bloco de Produto,
 * preview). Este componente consome essa fonte via `useProductLookup()` em
 * vez de manter seu próprio estado/efeitos de busca; os três estados
 * funcionais (loading/error/ready) e a combinação entre as duas buscas
 * permanecem EXATAMENTE como antes desta refatoração — só a origem do
 * estado mudou, nenhum comportamento visível.
 *
 * A ordem exibida (`productIds`) continua SEMPRE substituída pela resposta
 * da própria mutação (link/unlink/reorder) — nunca calculada ou persistida
 * localmente além da confirmação do servidor. Cada mutação bem-sucedida
 * chama `setProductIds` (do Provider) com o `productIds` já devolvido pela
 * API — nunca um novo `GET`/invalidação (fechamento explícito desta
 * tarefa: sem `refreshToken`/polling/cache preventivo).
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
  const { productIdsState, catalogState, setProductIds } = useProductLookup();
  const [selectedToLink, setSelectedToLink] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
      setProductIds(response.productIds);
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
      setProductIds(response.productIds);
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
      setProductIds(response.productIds);
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
