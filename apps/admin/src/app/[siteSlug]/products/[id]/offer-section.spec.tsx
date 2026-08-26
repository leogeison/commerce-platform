import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { Role } from '@commerce-platform/contracts';
import { OfferSection } from './offer-section';
import { SiteRoleProvider } from '../../site-role-context';
import { ToastProvider } from '../../toast-context';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 (todos os controles visíveis) — os testes
 * específicos de `VIEWER`/`EDITOR` passam a Role explicitamente.
 *
 * `UnsavedChangesProvider`/`ToastProvider` (UXA-014) — `OfferSection`
 * agora chama `useUnsavedChangesGuard()` (troca local criar↔editar) e
 * `useToast()` (toasts de sucesso) incondicionalmente; ambos exigem seus
 * Providers como ancestrais, mesmo critério já usado em
 * `product-detail.spec.tsx`.
 */
function renderSection(role: Role = 'OWNER') {
  return render(
    <UnsavedChangesProvider>
      <ToastProvider>
        <SiteRoleProvider value={role}>
          <OfferSection siteSlug="fastcompre" productId="prod-1" />
        </SiteRoleProvider>
      </ToastProvider>
    </UnsavedChangesProvider>,
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

  // --- UXA-014: só um OfferForm inline por vez ---

  it('UXA-014: abrir "Nova Oferta" com uma edição aberta e limpa fecha a edição e abre a criação sem diálogo', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByLabelText('Preço');

    await user.click(screen.getByRole('button', { name: 'Nova Oferta' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });

  it('UXA-014: abrir "Editar" com a criação aberta e limpa fecha a criação e abre a edição sem diálogo', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Nova Oferta' }));
    await screen.findByRole('button', { name: 'Criar' });

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toHaveValue('99.90');
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument();
  });

  it('UXA-014: abrir "Nova Oferta" com uma edição aberta e SUJA abre o diálogo; "Ficar" preserva a edição em aberto', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const priceInput = await screen.findByLabelText('Preço');
    await user.clear(priceInput);
    await user.type(priceInput, '199.90');

    await user.click(screen.getByRole('button', { name: 'Nova Oferta' }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toHaveValue('199.90');
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument();
  });

  it('UXA-014: ...; "Sair sem salvar" descarta a edição suja e abre a criação', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const priceInput = await screen.findByLabelText('Preço');
    await user.clear(priceInput);
    await user.type(priceInput, '199.90');

    await user.click(screen.getByRole('button', { name: 'Nova Oferta' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toHaveValue('');
  });

  it('UXA-014: abrir "Editar" com a criação aberta e SUJA abre o diálogo; confirmar descarta a criação e abre a edição', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Nova Oferta' }));
    await user.type(screen.getByLabelText('Preço'), '10.00');

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(screen.getByLabelText('Preço')).toHaveValue('99.90'));
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument();
  });

  it('UXA-014: nunca há dois OfferForm simultâneos no DOM, mesmo alternando entre os gatilhos', async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Nova Oferta' }));
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getAllByLabelText('Preço')).toHaveLength(1);
  });

  // --- UXA-014: toasts de sucesso ---

  it('UXA-014: criar com sucesso dispara o toast "Oferta salva."', async () => {
    const user = userEvent.setup();
    let getCallCount = 0;
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(201, makeOffer());
      }
      getCallCount += 1;
      return jsonResponse(200, {
        items: getCallCount === 1 ? [] : [makeOffer()],
        page: 1,
        pageSize: 20,
        total: getCallCount === 1 ? 0 : 1,
        totalPages: getCallCount === 1 ? 0 : 1,
      });
    });

    renderSection();
    await screen.findByText('Nenhuma Oferta cadastrada.');

    await user.click(screen.getByRole('button', { name: 'Nova Oferta' }));
    await user.type(screen.getByLabelText('Preço'), '99.90');
    await user.type(screen.getByLabelText('URL de afiliado'), 'https://exemplo.com/produto');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Oferta salva.');
  });

  it('UXA-014: editar com sucesso dispara o toast "Oferta salva."', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(200, makeOffer({ price: '199.90' }));
      }
      return jsonResponse(200, { items: [makeOffer({ price: '99.90' })], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    renderSection();
    await screen.findByText('MERCADO_LIVRE — 99.90 BRL');

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const priceInput = screen.getByLabelText('Preço');
    await user.clear(priceInput);
    await user.type(priceInput, '199.90');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Oferta salva.');
  });

  it('UXA-014: arquivar com sucesso dispara o toast "Oferta arquivada."', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(200, makeOffer({ archivedAt: '2026-01-02T00:00:00.000Z' }));
      }
      return jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    await screen.findByText('Oferta arquivada.');
  });

  it('UXA-014: desarquivar com sucesso dispara o toast "Oferta desarquivada."', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(200, makeOffer({ archivedAt: null }));
      }
      return jsonResponse(200, {
        items: [makeOffer({ archivedAt: '2026-01-02T00:00:00.000Z' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Desarquivar' }));

    await screen.findByText('Oferta desarquivada.');
  });

  it('UXA-014: excluir com sucesso dispara o toast "Oferta excluída."', async () => {
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

    await screen.findByText('Oferta excluída.');
  });

  // --- UXA-014: destaque visual reduzido de Oferta indisponível ---

  it('UXA-014: Oferta indisponível usa tom reduzido (muted), mantendo "(sem estoque)" no texto', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(200, { items: [makeOffer({ inStock: false })], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
      );
    renderSection();

    const row = await screen.findByText('MERCADO_LIVRE — 99.90 BRL (sem estoque)');
    expect(row).toHaveClass('text-fg-muted');
  });

  it('UXA-014: Oferta disponível não usa o tom reduzido', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    const row = await screen.findByText('MERCADO_LIVRE — 99.90 BRL');
    expect(row).not.toHaveClass('text-fg-muted');
  });

  // --- UXA-014: reflow responsivo da linha de Oferta ---
  //
  // jsdom não calcula layout real (flexbox/wrap), então estes testes não
  // provam ausência de overflow em nenhuma largura — isso foi verificado
  // empiricamente fora da suíte (Playwright + Tailwind v4 real, ver relato
  // de investigação) e precisa ser revalidado manualmente no navegador.
  // O que estes testes protegem é a *intenção estrutural*: que as classes
  // que permitem o reflow (`flex-wrap` no container da linha e no grupo de
  // ações, `min-w-0 break-words` no texto) não sejam removidas por engano
  // numa mudança futura.

  it('UXA-014: a linha da Oferta permite quebra (flex-wrap) e usa gap-x/gap-y em vez de gap único', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    const text = await screen.findByText('MERCADO_LIVRE — 99.90 BRL');
    const row = text.closest('li');
    expect(row).toHaveClass('flex-wrap');
    expect(row).toHaveClass('gap-x-4');
    expect(row).toHaveClass('gap-y-2');
    expect(row).not.toHaveClass('gap-4');
  });

  it('UXA-014: o texto da Oferta pode encolher e quebrar (min-w-0 break-words), sem flex-1', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    const text = await screen.findByText('MERCADO_LIVRE — 99.90 BRL');
    expect(text).toHaveClass('min-w-0');
    expect(text).toHaveClass('break-words');
    expect(text).not.toHaveClass('flex-1');
  });

  it('UXA-014: o grupo de ações (Editar/Arquivar/Excluir) permite quebra própria (flex-wrap), sem esconder ou truncar botões', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { items: [makeOffer()], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
    renderSection();

    const editButton = await screen.findByRole('button', { name: 'Editar' });
    const actionsGroup = editButton.closest('div');
    expect(actionsGroup).toHaveClass('flex-wrap');

    // Todos os três botões continuam presentes e acessíveis no DOM — o
    // reflow nunca esconde nem trunca uma ação.
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeVisible();
  });

  it('UXA-014: caso mais apertado (Oferta arquivada, rótulo "Desarquivar") também preserva flex-wrap e todas as ações visíveis', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [makeOffer({ archivedAt: '2026-01-02T00:00:00.000Z' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      }),
    );
    renderSection();

    const text = await screen.findByText('MERCADO_LIVRE — 99.90 BRL (arquivada)');
    const row = text.closest('li');
    expect(row).toHaveClass('flex-wrap');

    const editButton = screen.getByRole('button', { name: 'Editar' });
    const actionsGroup = editButton.closest('div');
    expect(actionsGroup).toHaveClass('flex-wrap');

    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desarquivar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeVisible();
  });

  // --- UXA-014: acessibilidade ---

  it('UXA-014: não tem violação de acessibilidade (jest-axe)', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(200, { items: [makeOffer({ inStock: false })], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
      );
    const { container } = renderSection();

    await screen.findByText('MERCADO_LIVRE — 99.90 BRL (sem estoque)');

    expect(await axe(container)).toHaveNoViolations();
  });
});
