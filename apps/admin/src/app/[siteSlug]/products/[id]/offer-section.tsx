'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button, Text } from '@commerce-platform/ui';
import { listOffersResponseSchema, offerAdminSchema, type ListOffersResponse, type OfferAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { roleMeetsMinimum } from '../../../../lib/role-hierarchy';
import { EmptyState, ErrorState, LoadingState } from '../../async-state';
import { useSiteRole } from '../../site-role-context';
import { useToast } from '../../toast-context';
import { useUnsavedChangesGuard } from '../../unsaved-changes-context';
import { OfferForm, type OfferFormInitialValues, type OfferFormValues } from './offer-form';

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

const DEFAULT_CREATE_VALUES: OfferFormInitialValues = {
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

function offerToFormValues(offer: OfferAdmin): OfferFormInitialValues {
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
 *
 * Visibilidade por Role (ADM-012) — sem componente `OfferReadOnly`
 * separado: a listagem já renderiza cada item como uma linha de texto por
 * padrão; `OfferForm` só aparece transitoriamente quando
 * `isCreating`/`editingOfferId` viram verdade, e os dois únicos gatilhos
 * disso são os botões "Nova Oferta"/"Editar". Escondendo esses dois
 * botões para quem não é `EDITOR`, a listagem em si já fica genuinamente
 * somente leitura, sem precisar duplicar a mesma linha de texto num
 * componente irmão. "Arquivar"/"Desarquivar"/"Excluir" exigem `OWNER`.
 *
 * UXA-014:
 * - Apresentação migrada de CSS Module para Tailwind v4 + tokens do
 *   design system + primitives `Button`/`Text` (`packages/ui`) e
 *   `LoadingState`/`ErrorState`/`EmptyState` (`../../async-state`), mesmo
 *   vocabulário já usado em `ProductForm`/`ProductReadOnly` (UXA-013).
 * - Destaque visual reduzido de Oferta indisponível (`inStock: false`,
 *   Architecture.md — "não depende só de cor"): `Text tone="muted"`
 *   envolvendo a linha inteira, mantendo o texto "(sem estoque)" — os dois
 *   sinais juntos, nunca só a cor.
 * - Toasts de sucesso (`useToast`, mesmo mecanismo de `ProductDetail`)
 *   para criar/editar, arquivar, desarquivar e excluir — nenhuma mudança
 *   nos erros de negócio existentes (incluindo o `409` de "possui cliques
 *   registrados", já coberto por `resolveErrorMessage`/
 *   `BUSINESS_ERROR_STATUS_CODES`, inalterados).
 * - Só um `OfferForm` inline por vez: `handleOpenCreate`/`handleOpenEdit`
 *   tornam `isCreating`/`editingOfferId` mutuamente exclusivos (antes desta
 *   tarefa era possível ter os dois simultaneamente — nenhum teste cobria
 *   esse caso, mas nada impedia). Trocar de formulário com o form atual
 *   sujo (`openFormIsDirty`, espelhado de `OfferForm.onDirtyChange`) pede
 *   confirmação via `confirmLeave(openFormIsDirty)` — o MESMO diálogo do
 *   guard de navegação, só que decidido pelo dirty LOCAL deste form, não
 *   pelo `isDirty` agregado da página inteira (que poderia estar `true` só
 *   por causa do `ProductForm`, sem relação com o que se perderia nesta
 *   troca local). Ver `unsaved-changes-context.tsx` para o desenho
 *   completo do `isDirtyOverride`.
 */
export function OfferSection({ siteSlug, productId }: OfferSectionProps) {
  const role = useSiteRole();
  const canEdit = roleMeetsMinimum(role, 'EDITOR');
  const canManage = roleMeetsMinimum(role, 'OWNER');
  const { showToast } = useToast();
  const { confirmLeave } = useUnsavedChangesGuard();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [isCreating, setIsCreating] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [openFormIsDirty, setOpenFormIsDirty] = useState(false);
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

  async function handleOpenCreate() {
    if (isCreating || editingOfferId !== null) {
      if (!(await confirmLeave(openFormIsDirty))) {
        return;
      }
    }
    setEditingOfferId(null);
    setIsCreating(true);
  }

  async function handleOpenEdit(offerId: string) {
    if (isCreating || (editingOfferId !== null && editingOfferId !== offerId)) {
      if (!(await confirmLeave(openFormIsDirty))) {
        return;
      }
    }
    setIsCreating(false);
    setEditingOfferId(offerId);
  }

  async function handleCreateSubmit(values: OfferFormValues) {
    await apiRequest(offersBasePath(siteSlug, productId), offerAdminSchema, {
      method: 'POST',
      body: values,
    });
    setIsCreating(false);
    await loadPage(page);
    showToast('Oferta salva.');
  }

  async function handleUpdateSubmit(offerId: string, values: OfferFormValues) {
    const updated = await apiRequest(
      `${offersBasePath(siteSlug, productId)}/${encodeURIComponent(offerId)}`,
      offerAdminSchema,
      { method: 'PATCH', body: values },
    );
    setEditingOfferId(null);
    if (state.status === 'ready') {
      setState({
        status: 'ready',
        data: { ...state.data, items: state.data.items.map((item) => (item.id === offerId ? updated : item)) },
      });
    }
    showToast('Oferta salva.');
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
      showToast(action === 'archive' ? 'Oferta arquivada.' : 'Oferta desarquivada.');
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
      showToast('Oferta excluída.');
    } catch (error) {
      setActionError(resolveErrorMessage(error, GENERIC_ACTION_ERROR_MESSAGE));
    } finally {
      setBusyOfferId(null);
    }
  }

  if (state.status === 'loading') {
    return <LoadingState>Carregando...</LoadingState>;
  }

  if (state.status === 'error') {
    return (
      <section className="mt-6 flex flex-col gap-4">
        <h2 className="m-0 font-ui text-lg">Ofertas</h2>
        <ErrorState>{state.message}</ErrorState>
      </section>
    );
  }

  const { items, totalPages } = state.data;

  return (
    <section className="mt-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 font-ui text-lg">Ofertas</h2>
        {canEdit && !isCreating && (
          <Button type="button" size="sm" onClick={() => handleOpenCreate()}>
            Nova Oferta
          </Button>
        )}
      </div>

      {isCreating && (
        <OfferForm
          initialValues={DEFAULT_CREATE_VALUES}
          submitLabel="Criar"
          onSubmit={handleCreateSubmit}
          onCancel={() => setIsCreating(false)}
          onDirtyChange={setOpenFormIsDirty}
        />
      )}

      {items.length === 0 ? (
        <EmptyState>Nenhuma Oferta cadastrada.</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((offer) =>
            editingOfferId === offer.id ? (
              <li key={offer.id}>
                <OfferForm
                  initialValues={offerToFormValues(offer)}
                  submitLabel="Salvar"
                  onSubmit={(values) => handleUpdateSubmit(offer.id, values)}
                  onCancel={() => setEditingOfferId(null)}
                  onDirtyChange={setOpenFormIsDirty}
                />
              </li>
            ) : (
              <li
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control border border-outline px-3 py-2"
              >
                <Text
                  as="span"
                  tone={offer.inStock ? 'primary' : 'muted'}
                  className="m-0 min-w-0 break-words"
                >
                  {offer.marketplace} — {offer.price} {offer.currency}
                  {offer.inStock ? '' : ' (sem estoque)'}
                  {offer.archivedAt ? ' (arquivada)' : ''}
                </Text>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(offer.id)}
                      disabled={busyOfferId === offer.id}
                    >
                      Editar
                    </Button>
                  )}
                  {canManage &&
                    (offer.archivedAt ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleArchiveToggle(offer.id, 'unarchive')}
                        disabled={busyOfferId === offer.id}
                      >
                        Desarquivar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleArchiveToggle(offer.id, 'archive')}
                        disabled={busyOfferId === offer.id}
                      >
                        Arquivar
                      </Button>
                    ))}
                  {canManage && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDelete(offer.id)}
                      disabled={busyOfferId === offer.id}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {actionError && <ErrorState>{actionError}</ErrorState>}

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handlePageChange(page - 1)}
          disabled={page <= 1}
        >
          Anterior
        </Button>
        {totalPages > 0 && (
          <Text as="span" variant="body-sm" className="m-0">
            Página {page} de {totalPages}
          </Text>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handlePageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
