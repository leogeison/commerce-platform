import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ProductDetail } from './product-detail';

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function renderDetail() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <ProductDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
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
      return handlers.onPatch ? handlers.onPatch() : jsonResponse(200, baseProduct);
    }
    if (init?.method === 'POST' && (url.endsWith('/archive') || url.endsWith('/unarchive'))) {
      return handlers.onArchiveAction ? handlers.onArchiveAction() : jsonResponse(200, baseProduct);
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
      onPatch: () => jsonResponse(200, { ...baseProduct, name: 'Fone Bluetooth Pro' }),
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Fone Bluetooth Pro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Fone Bluetooth Pro'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('arquivar com sucesso: atualiza o estado e troca o botão para "Desarquivar"', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch({
      onArchiveAction: () => jsonResponse(200, { ...baseProduct, archivedAt: '2026-01-02T00:00:00.000Z' }),
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
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
});
