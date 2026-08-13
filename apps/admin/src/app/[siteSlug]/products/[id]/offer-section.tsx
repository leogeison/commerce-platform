'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { listOffersResponseSchema, offerAdminSchema, type ListOffersResponse, type OfferAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { OfferForm, type OfferFormValues } from './offer-form';
import styles from './offer-section.module.css';

interface OfferSectionProps {
  siteSlug: string;
  productId: string;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListOffersResponse };

const PAGE_SIZE = 20;
const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar as Ofertas. Tente novamente em instantes.';
const GENERIC_ACTION_ERROR_MESSAGE = 'Não foi possível concluir esta ação. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

const DEFAULT_CREATE_VALUES: OfferFormValues = {
  marketplace: 'MERCADO_LIVRE',
  price: '',
  currency: 'BRL',
  affiliateUrl: '',
  inStock: true,
};

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

function offersBasePath(siteSlug: string, productId: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(productId)}/offers`;
}

function offerToFormValues(offer: OfferAdmin): OfferFormValues {
  return {
    marketplace: offer.marketplace,
    price: offer.price,
    currency: offer.currency,
    affiliateUrl: offer.affiliateUrl,
    inStock: offer.inStock,
  };
}

/**
 * Ofertas embutidas no detalhe do Produto (ADM-006; Architecture.md §32 —
 * "Ofertas sem página própria"). Busca `GET .../offers` diretamente (não o
 * resumo embutido em `productDetailAdminSchema`, que não tem `affiliateUrl`
 * suficiente pra editar).
 *
 * Criar/excluir mudam a contagem total, então re-buscam a página atual
 * depois do sucesso — diferente da regra "só atualiza local" usada em
 * Categoria/Produto, porque aqui a metadata de paginação (`total`/
 * `totalPages`) realmente muda. Editar/arquivar/desarquivar não mudam a
 * contagem, então só atualizam o item local, sem nova busca.
 */
export function OfferSection({ siteSlug, productId }: OfferSectionProps) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [isCreating, setIsCreating] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadPage(targetPage: number): Promise<ListOffersResponse | undefined> {
    try {
      const data = await apiRequest(
        `${offersBasePath(siteSlug, productId)}?page=${targetPage}&pageSize=${PAGE_SIZE}`,
        listOffersResponseSchema,
      );
      setState({ status: 'ready', data });
      setPage(targetPage);
      return data;
    } catch (error) {
      setState({ status: 'error', message: resolveErrorMessage(error, GENERIC_LOAD_ERROR_MESSAGE) });
      return undefined;
    }
  }

  /**
   * Busca inline (não via `loadPage`) só nesta primeira carga: `react-hooks/
   * set-state-in-effect` reprova qualquer efeito que invoque diretamente uma
   * função de escopo do componente que, em algum caminho, chame `setState`
   * — mesmo quando esse `setState` só acontece depois de um `await`, como em
   * `loadPage`. O padrão aceito (já usado em `CategoryList`/`ProductList`) é
   * chamar `apiRequest(...).then/.catch` diretamente no corpo do efeito, com
   * uma flag `cancelled` para ignorar a resposta se o componente desmontar
   * antes dela chegar. `loadPage` continua existindo para os handlers de
   * evento (paginação, criar, excluir), que não têm essa restrição.
   */
  useEffect(() => {
    let cancelled = false;

    apiRequest(
      `${offersBasePath(siteSlug, productId)}?page=1&pageSize=${PAGE_SIZE}`,
      listOffersResponseSchema,
    )
      .then((data) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', data });
        setPage(1);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: resolveErrorMessage(error, GENERIC_LOAD_ERROR_MESSAGE) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, productId]);

  function handlePageChange(nextPage: number) {
    setState({ status: 'loading' });
    void loadPage(nextPage);
  }

  async function handleCreateSubmit(values: OfferFormValues) {
    await apiRequest(offersBasePath(siteSlug, productId), offerAdminSchema, {
      method: 'POST',
      body: values,
    });
    setIsCreating(false);
    await loadPage(page);
  }

  async function handleUpdateSubmit(offerId: string, values: OfferFormValues) {
    const updated = await apiRequest(`${offersBasePath(siteSlug, productId)}/${encodeURIComponent(offerId)}`, offerAdminSchema, {
      method: 'PATCH',
      body: values,
    });
    setEditingOfferId(null);
    if (state.status === 'ready') {
      setState({
        status: 'ready',
        data: { ...state.data, items: state.data.items.map((item) => (item.id === offerId ? updated : item)) },
      });
    }
  }

  async function handleArchiveToggle(offerId: string, action: 'archive' | 'unarchive') {
    if (busyOfferId) {
      return;
    }
    setBusyOfferId(offerId);
    setActionError(null);
    try {
      const updated = await apiRequest(
        `${offersBasePath(siteSlug, productId)}/${encodeURIComponent(offerId)}/${action}`,
        offerAdminSchema,
        { method: 'POST' },
      );
      if (state.status === 'ready') {
        setState({
          status: 'ready',
          data: { ...state.data, items: state.data.items.map((item) => (item.id === offerId ? updated : item)) },
        });
      }
    } catch (error) {
      setActionError(resolveErrorMessage(error, GENERIC_ACTION_ERROR_MESSAGE));
    } finally {
      setBusyOfferId(null);
    }
  }

  /**
   * Se a exclusão remover o único item restante da página atual e `page >
   * 1`, volta uma página antes de recarregar — nunca deixa a UI numa
   * página vazia enquanto existe uma página anterior válida.
   */
  async function handleDelete(offerId: string) {
    if (busyOfferId) {
      return;
    }
    if (!window.confirm('Excluir esta Oferta? Esta ação não pode ser desfeita.')) {
      return;
    }
    setBusyOfferId(offerId);
    setActionError(null);
    try {
      await apiRequest(`${offersBasePath(siteSlug, productId)}/${encodeURIComponent(offerId)}`, z.void(), {
        method: 'DELETE',
      });
      const currentItemCount = state.status === 'ready' ? state.data.items.length : 0;
      const targetPage = currentItemCount <= 1 && page > 1 ? page - 1 : page;
      await loadPage(targetPage);
    } catch (error) {
      setActionError(resolveErrorMessage(error, GENERIC_ACTION_ERROR_MESSAGE));
    } finally {
      setBusyOfferId(null);
    }
  }

  if (state.status === 'loading') {
    return <p className={styles.status}>Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <section className={styles.section}>
        <h2>Ofertas</h2>
        <p role="alert" className={styles.status}>
          {state.message}
        </p>
      </section>
    );
  }

  const { items, totalPages } = state.data;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>Ofertas</h2>
        {!isCreating && (
          <button type="button" onClick={() => setIsCreating(true)}>
            Nova Oferta
          </button>
        )}
      </div>

      {isCreating && (
        <OfferForm
          initialValues={DEFAULT_CREATE_VALUES}
          submitLabel="Criar"
          onSubmit={handleCreateSubmit}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {items.length === 0 ? (
        <p className={styles.status}>Nenhuma Oferta cadastrada.</p>
      ) : (
        <ul className={styles.items}>
          {items.map((offer) =>
            editingOfferId === offer.id ? (
              <li key={offer.id}>
                <OfferForm
                  initialValues={offerToFormValues(offer)}
                  submitLabel="Salvar"
                  onSubmit={(values) => handleUpdateSubmit(offer.id, values)}
                  onCancel={() => setEditingOfferId(null)}
                />
              </li>
            ) : (
              <li key={offer.id} className={styles.row}>
                <span>
                  {offer.marketplace} — {offer.price} {offer.currency}
                  {offer.inStock ? '' : ' (sem estoque)'}
                  {offer.archivedAt ? ' (arquivada)' : ''}
                </span>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => setEditingOfferId(offer.id)} disabled={busyOfferId === offer.id}>
                    Editar
                  </button>
                  {offer.archivedAt ? (
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(offer.id, 'unarchive')}
                      disabled={busyOfferId === offer.id}
                    >
                      Desarquivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(offer.id, 'archive')}
                      disabled={busyOfferId === offer.id}
                    >
                      Arquivar
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(offer.id)} disabled={busyOfferId === offer.id}>
                    Excluir
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {actionError && (
        <p role="alert" className={styles.status}>
          {actionError}
        </p>
      )}

      <div className={styles.pagination}>
        <button type="button" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
          Anterior
        </button>
        {totalPages > 0 && (
          <span>
            Página {page} de {totalPages}
          </span>
        )}
        <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>
          Próxima
        </button>
      </div>
    </section>
  );
}
