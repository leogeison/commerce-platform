'use client';

import { useState } from 'react';
import { articleProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { Button, Text } from '@commerce-platform/ui';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { EmptyState, ErrorState, LoadingState } from '../../async-state';
import { useProductLookup } from '../product-lookup-context';

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
 *
 * UXE-014 — reposicionado de dentro de `.content` (`ArticleDetail`) para
 * dentro de `ArticleContextPanel` (painel lateral/drawer, ver
 * `article-context-panel.tsx`), sempre na composição `isDraft && canEdit`
 * — nenhuma mudança de comportamento funcional, só de localização/
 * apresentação. `ArticleContextPanel` não conhece Role nem reconstrói essa
 * condição: quem decide montar este componente continua sendo
 * `ArticleDetail`, via a prop de gating explícita que repassa a
 * `ArticleContextPanel` (ver doc comment de `ArticleDetail`).
 *
 * Reskin (UXE-014) para os primitives/padrões já aprovados em UXA-001/
 * UXA-014 — `Button`/`Text` (`packages/ui`) e `LoadingState`/`ErrorState`/
 * `EmptyState` (`../../async-state`), mesmo vocabulário de `OfferSection`
 * (`products/[id]/offer-section.tsx`), usado aqui só como referência
 * visual/estrutural. Nenhum comportamento de domínio foi importado por
 * analogia: sem tratamento novo para Produto arquivado (o rótulo "
 * (arquivado)" já existia antes desta tarefa, inalterado), sem paginação,
 * sem toasts — a lógica funcional (`handleLink`/`handleUnlink`/
 * `handleMove`, `isProcessing`, `actionError`, `selectedToLink`) é
 * exatamente a mesma de antes, só a apresentação mudou. `article-products-
 * section.module.css` foi removido nesta tarefa por ter ficado sem
 * nenhum consumidor.
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
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-ui text-lg">Produtos vinculados</h2>
        <LoadingState>Carregando Produtos vinculados...</LoadingState>
      </section>
    );
  }

  if (productIdsState.status === 'error' || catalogState.status === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-ui text-lg">Produtos vinculados</h2>
        <ErrorState>{GENERIC_LOAD_ERROR_MESSAGE}</ErrorState>
      </section>
    );
  }

  const productMap = new Map(catalogState.items.map((product) => [product.id, product]));
  const linkedProducts = productIdsState.productIds
    .map((id) => productMap.get(id))
    .filter((product): product is ProductAdmin => product !== undefined);
  const availableProducts = catalogState.items.filter((product) => !productIdsState.productIds.includes(product.id));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 font-ui text-lg">Produtos vinculados</h2>

      {linkedProducts.length === 0 ? (
        <EmptyState>Nenhum Produto vinculado.</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {linkedProducts.map((product, index) => (
            <li
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control border border-outline px-3 py-2"
            >
              <Text as="span" className="m-0 min-w-0 break-words">
                {product.name}
                {product.archivedAt ? ' (arquivado)' : ''}
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleMove(index, -1)}
                  disabled={isProcessing || index === 0}
                  aria-label={`Mover ${product.name} para cima`}
                >
                  Mover para cima
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleMove(index, 1)}
                  disabled={isProcessing || index === linkedProducts.length - 1}
                  aria-label={`Mover ${product.name} para baixo`}
                >
                  Mover para baixo
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => handleUnlink(product.id)} disabled={isProcessing}>
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="article-add-product" className="font-ui text-body-sm font-action">
          Adicionar Produto
        </label>
        <select
          id="article-add-product"
          value={selectedToLink}
          onChange={(event) => setSelectedToLink(event.target.value)}
          disabled={isProcessing}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body"
        >
          <option value="">Selecione um Produto</option>
          {availableProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.archivedAt ? ' (arquivado)' : ''}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={handleLink} disabled={isProcessing || !selectedToLink}>
          Vincular
        </Button>
      </div>

      {actionError && <ErrorState>{actionError}</ErrorState>}
    </section>
  );
}
