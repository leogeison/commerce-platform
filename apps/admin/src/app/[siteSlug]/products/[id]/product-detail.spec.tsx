import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Role } from '@commerce-platform/contracts';
import { ProductDetail } from './product-detail';
import { SiteRoleProvider } from '../../site-role-context';
import { ToastProvider } from '../../toast-context';
import { UnsavedChangesProvider, useUnsavedChangesGuard } from '../../unsaved-changes-context';

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 — os testes específicos de `VIEWER`/`EDITOR`
 * passam a Role explicitamente.
 *
 * `UnsavedChangesProvider` (UXA-003) — `ProductForm`, renderizado por
 * `ProductDetail` para EDITOR/OWNER, publica `isDirty` via
 * `useSyncFormDirty`, que exige o Provider como ancestral.
 *
 * `ToastProvider` (UXA-004) — `ProductDetail` agora chama `useToast()`
 * diretamente (`handleFormSuccess`), o que exige o Provider como ancestral
 * também para VIEWER (onde `ProductForm` não é renderizado, mas
 * `ProductDetail` ainda chama o hook incondicionalmente). Mesmo par de
 * Providers já usado em `category-detail.spec.tsx`.
 */
function renderDetail(role: Role = 'OWNER') {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <SiteRoleProvider value={role}>
            <ProductDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
          </SiteRoleProvider>
        </ToastProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

/**
 * Sonda de dirty-state, mesmo padrão de `ConfirmProbe` em
 * `product-form.spec.tsx`: expõe `confirmLeave()` do mesmo
 * `UnsavedChangesProvider` que `ProductForm` (renderizado dentro de
 * `ProductDetail`) publica seu `isDirty` — usada só na REGRESSÃO que prova
 * que `reset()` roda depois de um PATCH aceito (o sintoma relatado era o
 * guard aparecendo mesmo com o Produto já persistido).
 */
function ConfirmProbe() {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={() => {
        void confirmLeave();
      }}
    >
      Tentar sair
    </button>
  );
}

function renderDetailWithGuard(role: Role = 'OWNER') {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <SiteRoleProvider value={role}>
            <ProductDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
            <ConfirmProbe />
          </SiteRoleProvider>
        </ToastProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve('') } as Response;
}

const emptyOffersPage = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

const baseProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  name: 'Fone Bluetooth',
  slug: 'fone-bluetooth',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  offers: [],
};

/**
 * `PATCH`/`archive`/`unarchive` nunca devolvem `offers` de verdade —
 * confirmado por investigação de causa raiz em `toProductAdmin()`
 * (`apps/api/.../product.presenter.ts`): as três mutations retornam
 * `ProductAdmin` "raso", só o `GET` de detalhe devolve `offers`
 * (`productDetailAdminSchema`/`toProductDetailAdmin()`). Derivado de
 * `baseProduct` em vez de duplicado à mão, para nunca divergir dos mesmos
 * campos-base — `no-unused-vars` deste projeto não tem `ignoreRestSiblings`
 * habilitado, então `offers` (descartado de propósito) precisa de um `void`
 * explícito em vez de um simples prefixo `_`.
 */
const { offers, ...baseMutationProduct } = baseProduct;
void offers;

/**
 * Roteia por URL: `/offers` sempre responde com uma página vazia (o
 * `OfferSection` embutido faz sua própria busca independente do detalhe do
 * Produto) — o que interessa a estes testes é o comportamento da própria
 * `ProductDetail`, não o `OfferSection` (já coberto em `offer-section.spec.tsx`).
 * Chamadas de Categoria (`fetchAllCategories`, usado pelo `ProductForm`)
 * respondem com uma lista vazia.
 */
function mockFetch(handlers: {
  onGetProduct?: () => Response;
  onPatch?: () => Response;
  onArchiveAction?: () => Response;
  onDelete?: () => Response;
}) {
  return jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);

    if (url.includes('/offers')) {
      return jsonResponse(200, emptyOffersPage);
    }
    if (url.includes('/categories')) {
      return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    }
    if (init?.method === 'DELETE') {
      return handlers.onDelete ? handlers.onDelete() : emptyResponse(204);
    }
    if (init?.method === 'PATCH') {
      return handlers.onPatch ? handlers.onPatch() : jsonResponse(200, baseMutationProduct);
    }
    if (init?.method === 'POST' && (url.endsWith('/archive') || url.endsWith('/unarchive'))) {
      return handlers.onArchiveAction ? handlers.onArchiveAction() : jsonResponse(200, baseMutationProduct);
    }
    return handlers.onGetProduct ? handlers.onGetProduct() : jsonResponse(200, baseProduct);
  });
}

describe('ProductDetail', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDetail();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('404: mostra a mensagem vinda da API', async () => {
    global.fetch = mockFetch({
      onGetProduct: () =>
        jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Produto não encontrado.' }),
    });
    renderDetail();

    expect(await screen.findByText('Produto não encontrado.')).toBeInTheDocument();
  });

  it('sucesso (produto ativo): preenche o formulário, mostra "Arquivar" e a seção de Ofertas', async () => {
    global.fetch = mockFetch({});
    renderDetail();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Fone Bluetooth');
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ofertas')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma Oferta cadastrada.')).toBeInTheDocument();
  });

  it('sucesso (produto arquivado): mostra o botão "Desarquivar"', async () => {
    global.fetch = mockFetch({
      onGetProduct: () => jsonResponse(200, { ...baseProduct, archivedAt: '2026-01-02T00:00:00.000Z' }),
    });
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
  });

  it('editar com sucesso: atualiza o estado local, permanece na página', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onPatch: () => jsonResponse(200, { ...baseMutationProduct, name: 'Fone Bluetooth Pro' }),
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Fone Bluetooth Pro'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- Regressão: PATCH real (200 + `ProductAdmin` sem `offers`) não pode
  // produzir um falso erro de "Não foi possível salvar" — a causa raiz
  // investigada e corrigida nesta tarefa. `baseMutationProduct` acima
  // reflete literalmente o formato de `toProductAdmin()`: sem a chave
  // `offers`, não só com o array vazio (um objeto com `offers: []` já
  // teria passado mesmo no schema antigo — o bug só se manifesta quando a
  // chave está genuinamente ausente).

  it('REGRESSÃO: editar com sucesso (PATCH 200 + ProductAdmin sem offers) não produz falso erro, executa reset/onSuccess/toast', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onPatch: () => jsonResponse(200, { ...baseMutationProduct, name: 'Fone Bluetooth Pro' }),
    });
    renderDetailWithGuard();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // onSuccess/toast: prova que o fluxo completo (onSubmit -> reset ->
    // onSuccess) rodou até o fim, não só que o request teve status 200.
    await screen.findByText('Produto salvo.');
    // Nenhum erro falso, nem o de "PATCH incompatível" nem o genérico de
    // submissão.
    expect(
      screen.queryByText('Não foi possível salvar o Produto. Tente novamente em instantes.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Resposta da API não corresponde ao contrato esperado.')).not.toBeInTheDocument();

    // reset(): prova que o formulário não ficou "dirty" depois do save —
    // era exatamente esse o sintoma relatado (guard de saída aparecendo
    // mesmo após persistência real já bem-sucedida). Mesma evidência
    // observável usada em `product-form.spec.tsx` (`ProductForm` não expõe
    // `formState.isDirty` como texto).
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('REGRESSÃO: resposta de PATCH realmente incompatível (sem name) ainda produz erro', async () => {
    const user = userEvent.setup();
    const { name, ...invalidPatchResponse } = baseMutationProduct;
    void name;
    global.fetch = mockFetch({
      onPatch: () => jsonResponse(200, invalidPatchResponse),
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o Produto. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Produto salvo.')).not.toBeInTheDocument();
  });

  it('arquivar com sucesso: atualiza o estado e troca o botão para "Desarquivar"', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onArchiveAction: () => jsonResponse(200, { ...baseMutationProduct, archivedAt: '2026-01-02T00:00:00.000Z' }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
  });

  it('REGRESSÃO: desarquivar com sucesso (POST 200 + ProductAdmin sem offers) troca o botão de volta para "Arquivar", sem erro', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onGetProduct: () => jsonResponse(200, { ...baseProduct, archivedAt: '2026-01-02T00:00:00.000Z' }),
      onArchiveAction: () => jsonResponse(200, { ...baseMutationProduct, archivedAt: null }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Desarquivar' }));

    expect(await screen.findByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Não foi possível concluir esta ação. Tente novamente em instantes.'),
    ).not.toBeInTheDocument();
  });

  it('arquivar com falha: mostra mensagem de erro acessível, estado não muda (mesmo mecanismo cobre unarchive)', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onArchiveAction: () => jsonResponse(500, { unexpected: 'shape' }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(
      await screen.findByText('Não foi possível concluir esta ação. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('excluir: confirmação aceita chama DELETE e redireciona para a lista', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = mockFetch({});
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/fastcompre/products'));
  });

  it('excluir: confirmação recusada não chama DELETE nem navega', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = mockFetch({});
    global.fetch = fetchMock;
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('excluir: conflito (409, com Ofertas) mostra a mensagem da API, permanece na página', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = mockFetch({
      onDelete: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Este Produto possui Ofertas vinculadas e não pode ser excluído.',
        }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText('Este Produto possui Ofertas vinculadas e não pode ser excluído.'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- ADM-012: visibilidade por Role ---

  it('EDITOR: mostra o ProductForm, sem nenhum botão de ciclo de vida', async () => {
    global.fetch = mockFetch({});
    renderDetail('EDITOR');

    expect(await screen.findByLabelText('Nome')).toHaveValue('Fone Bluetooth');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('VIEWER: mostra ProductReadOnly, sem ProductForm nem botões de ciclo de vida', async () => {
    global.fetch = mockFetch({});
    renderDetail('VIEWER');

    expect(await screen.findByRole('heading', { name: 'Fone Bluetooth' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  // --- UXA-001: LoadingState/ErrorState compartilhados ---

  it('UXA-001: estado de loading não usa role="alert" e não trava foco (sem violação de acessibilidade)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail();

    const loadingNode = screen.getByText('Carregando...');
    expect(loadingNode).not.toHaveAttribute('role', 'alert');
    expect(loadingNode).not.toHaveAttribute('tabindex');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('UXA-001: erro de carregamento (404) é anunciado via role="alert" (sem violação de acessibilidade)', async () => {
    global.fetch = mockFetch({
      onGetProduct: () =>
        jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Produto não encontrado.' }),
    });
    const { container } = renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Produto não encontrado.');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('UXA-001: erro de ação (falha ao arquivar) é anunciado via role="alert"', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onArchiveAction: () => jsonResponse(500, { unexpected: 'shape' }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir esta ação. Tente novamente em instantes.',
    );
  });

  // --- UXA-004: toast de sucesso (replicado integralmente para Produto — edição) ---

  it('UXA-004: editar com sucesso dispara o toast "Produto salvo."', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onPatch: () => jsonResponse(200, { ...baseMutationProduct, name: 'Fone Bluetooth Pro' }),
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Produto salvo.');
  });

  it('UXA-004: editar com erro não dispara o toast', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onPatch: () => jsonResponse(500, { unexpected: 'shape' }),
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Não foi possível salvar o Produto. Tente novamente em instantes.');
    expect(screen.queryByText('Produto salvo.')).not.toBeInTheDocument();
  });
});
