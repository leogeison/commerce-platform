import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Role } from '@commerce-platform/contracts';
import { OfferSection } from './offer-section';
import { SiteRoleProvider } from '../../site-role-context';

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 (todos os controles visíveis) — os testes
 * específicos de `VIEWER`/`EDITOR` passam a Role explicitamente.
 */
function renderSection(role: Role = 'OWNER') {
  return render(
    <SiteRoleProvider value={role}>
      <OfferSection siteSlug="fastcompre" productId="prod-1" />
    </SiteRoleProvider>,
  );
}

function makeOffer(overrides: Partial<{ id: string; price: string; inStock: boolean; archivedAt: string | null }> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    productId: '33333333-3333-4333-8333-333333333333',
    marketplace: 'MERCADO_LIVRE',
    price: overrides.price ?? '99.90',
    currency: 'BRL',
    affiliateUrl: 'https://exemplo.com/produto',
    inStock: overrides.inStock ?? true,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
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

describe('OfferSection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('erro genérico ao carregar: mostra mensagem', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' }));
    renderSection();

    expect(
      await screen.findByText('Não foi possível carregar as Ofertas. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('lista vazia: mostra mensagem acessível', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
    renderSection();

    expect(await screen.findByText('Nenhuma Oferta cadastrada.')).toBeInTheDocument();
  });

  it('lista com itens: renderiza marketplace/preço/moeda e indica sem estoque/arquivada', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeOffer({ price: '150.00', inStock: false, archivedAt: '2026-01-02T00:00:00.000Z' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      }),
    );
    renderSection();

    expect(
      await screen.findByText('MERCADO_LIVRE — 150.00 BRL (sem estoque) (arquivada)'),
    ).toBeInTheDocument();
  });

  it('criar Oferta: alterna o formulário, submit válido cria e re-busca a página atual', async () => {
    const user = userEvent.setup();
    let getCallCount = 0;
    const fetchMock = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(201, makeOffer());
      }
      getCallCount += 1;
      return jsonResponse(200, { items: getCallCount === 1 ? [] : [makeOffer()], page: 1, pageSize: 20, total: getCallCount === 1 ? 0 : 1, totalPages: getCallCount === 1 ? 0 : 1 });
    });
    global.fetch = fetchMock;

    renderSection();
    await screen.findByText('Nenhuma Oferta cadastrada.');

    await user.click(screen.getByRole('button', { name: 'Nova Oferta' }));
    await user.type(screen.getByLabelText('Preço'), '99.90');
    await user.type(screen.getByLabelText('URL de afiliado'), 'https://exemplo.com/produto');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByLabelText('Preço')).not.toBeInTheDocument());
    expect(getCallCount).toBe(2);
  });

  it('editar Oferta: alterna pra formulário inline, submit válido atualiza local sem nova busca da lista', async () => {
    const user = userEvent.setup();
    let getCallCount = 0;
    const fetchMock = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(200, makeOffer({ price: '199.90' }));
      }
      getCallCount += 1;
      return jsonResponse(200, { items: [makeOffer({ price: '99.90' })], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });
    global.fetch = fetchMock;

    renderSection();
    await screen.findByText('MERCADO_LIVRE — 99.90 BRL');

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const priceInput = screen.getByLabelText('Preço');
    await user.clear(priceInput);
    await user.type(priceInput, '199.90');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('MERCADO_LIVRE — 199.90 BRL')).toBeInTheDocument();
    expect(getCallCount).toBe(1);
  });

  it('arquivar com sucesso: atualiza local, troca o botão para "Desarquivar" (mesmo mecanismo cobre desarquivar)', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(200, makeOffer({ archivedAt: '2026-01-02T00:00:00.000Z' }));
      }
      return jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
  });

  it('arquivar com falha: mostra erro acessível, estado não muda', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(500, { unexpected: 'shape' });
      }
      return jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(
      await screen.findByText('Não foi possível concluir esta ação. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('excluir: confirmação aceita chama DELETE e re-busca a página atual', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    let getCallCount = 0;
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return emptyResponse(204);
      }
      getCallCount += 1;
      return jsonResponse(200, {
        items: getCallCount === 1 ? [makeOffer()] : [],
        page: 1,
        pageSize: 20,
        total: getCallCount === 1 ? 1 : 0,
        totalPages: getCallCount === 1 ? 1 : 0,
      });
    });

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Nenhuma Oferta cadastrada.')).toBeInTheDocument();
    expect(getCallCount).toBe(2);
  });

  it('excluir: confirmação recusada não chama DELETE', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    global.fetch = fetchMock;

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
  });

  it('excluir o último item de uma página > 1: recua uma página e carrega a página válida', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    let page1CallCount = 0;
    const fetchMock = jest.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'DELETE') {
        return emptyResponse(204);
      }
      const url = new URL(String(input));
      const page = url.searchParams.get('page');

      if (page === '1') {
        page1CallCount += 1;
        return jsonResponse(200, {
          items: [makeOffer({ id: '44444444-4444-4444-8444-444444444444' })],
          page: 1,
          pageSize: 20,
          total: page1CallCount === 1 ? 2 : 1,
          totalPages: page1CallCount === 1 ? 2 : 1,
        });
      }

      return jsonResponse(200, {
        items: [makeOffer({ id: '55555555-5555-4555-8555-555555555555' })],
        page: 2,
        pageSize: 20,
        total: 2,
        totalPages: 2,
      });
    });
    global.fetch = fetchMock;

    renderSection();

    await waitFor(() => expect(screen.getByText('Página 1 de 2')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(screen.getByText('Página 1 de 1')).toBeInTheDocument());
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const lastUrl = new URL(String(lastCall[0]));
    expect(lastUrl.searchParams.get('page')).toBe('1');
  });

  // --- ADM-012: visibilidade por Role ---

  it('VIEWER: sem "Nova Oferta", sem "Editar", sem "Arquivar"/"Excluir" — só a linha de texto', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
    );
    renderSection('VIEWER');

    expect(await screen.findByText('MERCADO_LIVRE — 99.90 BRL')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova Oferta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('EDITOR: mostra "Nova Oferta" e "Editar", sem "Arquivar"/"Desarquivar"/"Excluir"', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
    );
    renderSection('EDITOR');

    expect(await screen.findByRole('button', { name: 'Nova Oferta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('VIEWER: estruturalmente nunca monta o OfferForm (sem gatilho de criar/editar disponível)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
    );
    renderSection('VIEWER');

    await screen.findByText('MERCADO_LIVRE — 99.90 BRL');
    expect(screen.queryByLabelText('Preço')).not.toBeInTheDocument();
  });
});
