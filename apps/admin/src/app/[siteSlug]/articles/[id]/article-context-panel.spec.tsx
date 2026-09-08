import { useRef } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ArticleAdmin, ArticleStatus, Role } from '@commerce-platform/contracts';
import { ArticleContextPanel } from './article-context-panel';
import { SiteRoleProvider } from '../../site-role-context';
import { PageModalProvider } from '../../page-modal-context';

/**
 * apps/admin/src/app/[siteSlug]/articles/[id]/article-context-panel.spec.tsx
 *
 * UXE-012 — Painel lateral contextual do Artigo (desktop).
 * UXE-013 — modalidade mobile (drawer), indicador externo de saúde,
 * inertização do conteúdo editorial via ref explícito e integração com
 * `PageModalContext`.
 *
 * Testa `ArticleContextPanel` ISOLADO (sem `ArticleDetail`) — mesmo
 * critério já usado por `article-transition-panel.spec.tsx`/
 * `article-health-checklist.spec.tsx`: os dois componentes internos
 * (`ArticleHealthChecklist`/`ArticleTransitionPanel`) não são mockados
 * aqui, só a fronteira de rede (`fetch`), porque o objetivo é provar que
 * a CASCA de composição (heading, `aria-labelledby`, badge, uma única
 * montagem de cada filho, modalidade mobile) funciona de ponta a ponta
 * com o comportamento real desses dois componentes — não reimplementa a
 * cobertura já existente e completa de cada um deles individualmente
 * (framing por status, `MIN_ROLE_BY_TRANSITION`, `pendingAction`, etc.),
 * que continua em seus próprios specs, intocados por esta tarefa.
 *
 * `PageModalProvider` (real, não mockado) é necessário porque
 * `ArticleContextPanel` consome `usePageModal()` — `AuthenticatedShell`,
 * quem monta este Provider em produção, está fora do escopo desta
 * suíte; um `setPageModalOpen` (jest.fn(), injetável via `renderPanel`)
 * faz o papel do estado real do shell.
 *
 * `Harness` (abaixo) cria um `useRef<HTMLDivElement>(null)` local — o
 * mesmo papel que `ArticleDetail.contentRef` desempenha em produção — e
 * repassa via `backgroundContentRef`, exatamente como a API real exige
 * (ajuste pós-revisão: `ArticleContextPanel` não descobre mais seu
 * elemento de fundo por posição relativa no DOM, só pelo `ref` recebido).
 * A fiação REAL entre `ArticleDetail` e este componente (o `ref` sendo
 * criado e anexado ao `.content` verdadeiro) é coberta separadamente em
 * `article-detail.spec.tsx` — aqui o alvo do `ref` é só um `<div
 * data-testid="editorial-content">` de teste.
 *
 * A presença do painel nas DUAS composições de `ArticleDetail` (DRAFT
 * editável e read-only) é coberta em `article-detail.spec.tsx`, não
 * aqui — este arquivo cobre só o componente em si.
 */

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';

const STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_REVIEW: 'Em revisão',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

const HEALTH_FRAMING_BY_STATUS: Record<ArticleStatus, string> = {
  DRAFT: 'Preparação do Artigo',
  PENDING_REVIEW: 'Prontidão para publicação',
  PUBLISHED: 'Saúde operacional',
  ARCHIVED: 'Informações de saúde',
};

const TRANSITION_PATH_PATTERN = /\/(submit-for-review|revert-to-draft|publish|archive|restore-to-draft)$/;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function healthyResponse() {
  return {
    categoryActive: true,
    hasAtLeastOneProduct: true,
    allProductsHaveValidOffer: true,
    invalidProducts: [],
    slugUnique: true,
    metaDescriptionFilled: true,
    coverImagePresent: true,
    healthy: true,
  };
}

function catalogResponse(items: unknown[] = []) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

function makeArticle(overrides: Partial<ArticleAdmin> = {}): ArticleAdmin {
  return {
    id: ARTICLE_ID,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'PENDING_REVIEW',
    title: 'Melhor fone Bluetooth',
    slug: 'melhor-fone-bluetooth',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx: '',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetch(
  options: { transition?: () => Response | Promise<Response>; health?: () => Response } = {},
) {
  const fetchMock = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST' && TRANSITION_PATH_PATTERN.test(url)) {
      return options.transition ? options.transition() : jsonResponse(200, makeArticle({ status: 'PUBLISHED' }));
    }
    if (url.endsWith('/health')) {
      return options.health ? options.health() : jsonResponse(200, healthyResponse());
    }
    return catalogResponse();
  });
  global.fetch = fetchMock;
  return fetchMock;
}

interface HarnessProps {
  status: ArticleStatus;
  onTransition: (article: ArticleAdmin) => void;
  role: Role;
  setPageModalOpen: (isOpen: boolean) => void;
  withBackground: boolean;
}

/**
 * Cria o `ref` localmente (papel de `ArticleDetail.contentRef` em
 * produção) e só o repassa a `ArticleContextPanel` quando
 * `withBackground` é `true` — ver doc comment do arquivo.
 */
function Harness({ status, onTransition, role, setPageModalOpen, withBackground }: HarnessProps) {
  const backgroundRef = useRef<HTMLDivElement>(null);
  return (
    <SiteRoleProvider value={role}>
      <PageModalProvider setPageModalOpen={setPageModalOpen}>
        {withBackground && (
          <div data-testid="editorial-content" ref={backgroundRef}>
            Conteúdo do editor
          </div>
        )}
        <ArticleContextPanel
          siteSlug={SITE_SLUG}
          articleId={ARTICLE_ID}
          status={status}
          healthRefreshKey={0}
          onTransition={onTransition}
          backgroundContentRef={withBackground ? backgroundRef : undefined}
        />
      </PageModalProvider>
    </SiteRoleProvider>
  );
}

function renderPanel(
  status: ArticleStatus,
  onTransition: (article: ArticleAdmin) => void = jest.fn(),
  role: Role = 'OWNER',
  extra: { setPageModalOpen?: (isOpen: boolean) => void; withBackground?: boolean } = {},
) {
  return render(
    <Harness
      status={status}
      onTransition={onTransition}
      role={role}
      setPageModalOpen={extra.setPageModalOpen ?? jest.fn()}
      withBackground={extra.withBackground ?? true}
    />,
  );
}

describe('ArticleContextPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
    document.body.style.overflow = '';
  });

  it('região complementary com nome acessível derivado do heading visível via aria-labelledby (fechado/desktop)', async () => {
    mockFetch();
    renderPanel('DRAFT');

    const heading = await screen.findByRole('heading', { level: 2, name: 'Status do Artigo' });
    const region = screen.getByRole('complementary', { name: 'Status do Artigo' });
    expect(region).toContainElement(heading);
  });

  it.each<ArticleStatus>(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'])(
    'badge combina rótulo de status + resumo de saúde para %s (saudável: "Sem pendências")',
    async (status) => {
      mockFetch();
      renderPanel(status);

      expect(await screen.findByText(`${STATUS_LABELS[status]} · Sem pendências`)).toBeInTheDocument();
    },
  );

  it('ArticleHealthChecklist e ArticleTransitionPanel continuam montados exatamente uma vez cada dentro do painel', async () => {
    mockFetch();
    renderPanel('PENDING_REVIEW');

    expect(await screen.findAllByRole('heading', { name: HEALTH_FRAMING_BY_STATUS.PENDING_REVIEW })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Publicar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Voltar para rascunho' })).toHaveLength(1);
  });

  it('ação de transição já existente continua acessível e funcional a partir do painel (sem novo GET /:id)', async () => {
    const user = userEvent.setup();
    const onTransition = jest.fn();
    mockFetch({ transition: () => jsonResponse(200, makeArticle({ status: 'PUBLISHED' })) });
    renderPanel('PENDING_REVIEW', onTransition);

    await user.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(onTransition).toHaveBeenCalledWith(expect.objectContaining({ status: 'PUBLISHED' }));
  });

  it('VIEWER: nenhum botão de transição aparece, mas painel/heading/badge/checklist continuam presentes', async () => {
    mockFetch();
    renderPanel('DRAFT', jest.fn(), 'VIEWER');

    expect(screen.getByRole('complementary', { name: 'Status do Artigo' })).toBeInTheDocument();
    expect(await screen.findByText(`${STATUS_LABELS.DRAFT} · Sem pendências`)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: HEALTH_FRAMING_BY_STATUS.DRAFT })).toBeInTheDocument();
    // O único botão presente é o trigger mobile "Status e ações do Artigo" — nenhum botão de transição.
    expect(screen.queryByRole('button', { name: 'Status e ações do Artigo' })).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button').filter((button) => button.textContent !== 'Status e ações do Artigo'),
    ).toHaveLength(0);
  });

  it.each<ArticleStatus>(['DRAFT', 'ARCHIVED'])('jest-axe: nenhuma violação para status %s (fechado/desktop)', async (status) => {
    mockFetch();
    const { container } = renderPanel(status);

    await screen.findByText(`${STATUS_LABELS[status]} · Sem pendências`);
    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXE-013: indicador externo (status + resumo de saúde) ---

  describe('UXE-013 — indicador externo de saúde', () => {
    it('loading: mostra só o rótulo de status, sem sufixo de pendências', () => {
      global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
      renderPanel('DRAFT');

      expect(screen.getByText('Rascunho')).toBeInTheDocument();
    });

    it('error: mostra só o rótulo de status', async () => {
      mockFetch({ health: () => jsonResponse(500, {}) });
      renderPanel('DRAFT');

      await screen.findByText('Não foi possível carregar o checklist de saúde do Artigo.');
      expect(screen.getByText('Rascunho')).toBeInTheDocument();
    });

    it('ready com 0 pendências: "Rascunho · Sem pendências"', async () => {
      mockFetch();
      renderPanel('DRAFT');

      expect(await screen.findByText('Rascunho · Sem pendências')).toBeInTheDocument();
    });

    it('ready com 1 pendência: "Rascunho · 1 pendência"', async () => {
      mockFetch({ health: () => jsonResponse(200, { ...healthyResponse(), categoryActive: false, healthy: false }) });
      renderPanel('DRAFT');

      expect(await screen.findByText('Rascunho · 1 pendência')).toBeInTheDocument();
    });

    it('ready com N pendências: "Rascunho · 4 pendências"', async () => {
      mockFetch({
        health: () =>
          jsonResponse(200, {
            ...healthyResponse(),
            categoryActive: false,
            metaDescriptionFilled: false,
            coverImagePresent: false,
            slugUnique: false,
            healthy: false,
          }),
      });
      renderPanel('DRAFT');

      expect(await screen.findByText('Rascunho · 4 pendências')).toBeInTheDocument();
    });
  });

  // --- UXE-013: modalidade mobile (drawer) ---

  describe('UXE-013 — drawer mobile', () => {
    it('trigger "Status e ações do Artigo" com aria-haspopup/aria-expanded corretos, abre o drawer ao clicar', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      const trigger = await screen.findByRole('button', { name: 'Status e ações do Artigo' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).not.toHaveAttribute('inert');

      await user.click(trigger);

      expect(screen.getByRole('dialog', { name: 'Status do Artigo' })).toBeInTheDocument();
    });

    it('ao abrir: wrapper ganha role="dialog"/aria-modal="true"/aria-labelledby; o <aside> vira role="none"', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));

      const dialogEl = screen.getByRole('dialog', { name: 'Status do Artigo' });
      expect(dialogEl).toHaveAttribute('aria-modal', 'true');
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('mobile fechado: o <aside> permanece complementary', async () => {
      mockFetch();
      renderPanel('DRAFT');

      await screen.findByText('Rascunho · Sem pendências');
      expect(screen.getByRole('complementary', { name: 'Status do Artigo' })).toBeInTheDocument();
    });

    it('ao abrir: o trigger NUNCA desmonta — permanece no DOM, ganha inert e aria-expanded="true"; clique nele enquanto aberto não faz nada', async () => {
      const user = userEvent.setup();
      mockFetch();
      const { container } = renderPanel('DRAFT');

      const trigger = screen.getByRole('button', { name: 'Status e ações do Artigo' });
      await user.click(trigger);
      await screen.findByRole('dialog', { name: 'Status do Artigo' });

      // mesmo nó React/DOM, ainda presente, agora inert.
      expect(container.contains(trigger)).toBe(true);
      expect(trigger).toHaveAttribute('inert');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // guarda dupla no handler (independente do bloqueio de clique do
      // próprio `inert`, que o jsdom não reproduz por completo).
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog', { name: 'Status do Artigo' })).toBeInTheDocument();
    });

    it('foco inicial vai para o botão de fechar ao abrir', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));

      expect(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' })).toHaveFocus();
    });

    it('Escape fecha o drawer', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      await screen.findByRole('dialog', { name: 'Status do Artigo' });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clique no backdrop fecha o drawer', async () => {
      const user = userEvent.setup();
      mockFetch();
      const { container } = renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      const backdrop = container.querySelector('[aria-hidden="true"]');
      expect(backdrop).not.toBeNull();

      fireEvent.click(backdrop as Element);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('fechar (botão) restaura o foco ao MESMO trigger que abriu o drawer (ele nunca desmontou)', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      const trigger = screen.getByRole('button', { name: 'Status e ações do Artigo' });
      await user.click(trigger);
      await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));

      expect(trigger).toHaveFocus();
      expect(trigger).not.toHaveAttribute('inert');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('ciclo de foco explícito: Tab no último focável (dentro do <aside>) volta ao primeiro; Shift+Tab no primeiro vai ao último', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      const closeButton = await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' });
      const submitButton = await screen.findByRole('button', { name: 'Enviar para revisão' });
      const dialogEl = screen.getByRole('dialog', { name: 'Status do Artigo' });

      expect(closeButton).toHaveFocus();

      submitButton.focus();
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
      fireEvent(dialogEl, tabEvent);
      expect(tabEvent.defaultPrevented).toBe(true);
      expect(closeButton).toHaveFocus();

      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
      fireEvent(dialogEl, shiftTabEvent);
      expect(shiftTabEvent.defaultPrevented).toBe(true);
      expect(submitButton).toHaveFocus();
    });

    it('o trigger (fora do <aside>, sempre inert quando aberto) nunca entra no ciclo de Tab do trap', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      const trigger = screen.getByRole('button', { name: 'Status e ações do Artigo' });
      await user.click(trigger);
      const closeButton = await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' });
      const dialogEl = screen.getByRole('dialog', { name: 'Status do Artigo' });

      // Shift+Tab a partir do primeiro focável do <aside> (closeButton)
      // nunca deveria ir para o trigger — vai para o último focável do
      // próprio <aside> (o ciclo é escopado a `asideRef`, nunca ao
      // wrapper inteiro, que também contém o trigger).
      closeButton.focus();
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
      fireEvent(dialogEl, shiftTabEvent);

      expect(trigger).not.toHaveFocus();
      expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toHaveFocus();
    });

    it('scroll lock: trava overflow do body ao abrir e restaura o valor anterior ao fechar', async () => {
      const user = userEvent.setup();
      mockFetch();
      document.body.style.overflow = 'scroll';
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      expect(document.body.style.overflow).toBe('hidden');

      await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('elemento de fundo (backgroundContentRef) fica inert enquanto o drawer mobile está aberto', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT');

      const background = screen.getByTestId('editorial-content');
      expect(background).not.toHaveAttribute('inert');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      expect(background).toHaveAttribute('inert');

      await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
      expect(background).not.toHaveAttribute('inert');
    });

    it('sem backgroundContentRef (prop ausente): não quebra ao abrir/fechar', async () => {
      const user = userEvent.setup();
      mockFetch();
      renderPanel('DRAFT', jest.fn(), 'OWNER', { withBackground: false });

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      expect(screen.getByRole('dialog', { name: 'Status do Artigo' })).toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('jest-axe: nenhuma violação com o drawer mobile aberto', async () => {
      const user = userEvent.setup();
      mockFetch();
      const { container } = renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      await screen.findByRole('dialog', { name: 'Status do Artigo' });

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  // --- UXE-013: PageModalContext ---

  describe('UXE-013 — PageModalContext', () => {
    it('reporta isMobileOpen a AuthenticatedShell via setPageModalOpen (true ao abrir, false ao fechar)', async () => {
      const user = userEvent.setup();
      mockFetch();
      const setPageModalOpen = jest.fn();
      renderPanel('DRAFT', jest.fn(), 'OWNER', { setPageModalOpen });

      expect(setPageModalOpen).toHaveBeenLastCalledWith(false);

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      expect(setPageModalOpen).toHaveBeenLastCalledWith(true);

      await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
      expect(setPageModalOpen).toHaveBeenLastCalledWith(false);
    });

    it('unmount inesperado com o drawer aberto nunca deixa a shell inert (cleanup chama setPageModalOpen(false))', async () => {
      const user = userEvent.setup();
      mockFetch();
      const setPageModalOpen = jest.fn();
      const { unmount } = renderPanel('DRAFT', jest.fn(), 'OWNER', { setPageModalOpen });

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      expect(setPageModalOpen).toHaveBeenLastCalledWith(true);

      unmount();

      expect(setPageModalOpen).toHaveBeenLastCalledWith(false);
    });
  });

  // --- UXE-013: identidade preservada ao cruzar o breakpoint (invariante central) ---

  describe('UXE-013 — identidade preservada ao cruzar 1024px', () => {
    it('iniciar uma transição, deixá-la pendente, cruzar para desktop: pendingAction sobrevive e /health não refaz', async () => {
      const user = userEvent.setup();
      const changeListeners: Array<(event: { matches: boolean }) => void> = [];
      const addEventListener = jest.fn((type: string, listener: (event: { matches: boolean }) => void) => {
        if (type === 'change') {
          changeListeners.push(listener);
        }
      });
      const mediaQueryListStub = {
        matches: false,
        media: '(min-width: 1024px)',
        addEventListener,
        removeEventListener: jest.fn(),
      };
      window.matchMedia = jest.fn().mockReturnValue(mediaQueryListStub) as unknown as typeof window.matchMedia;

      // A transição fica pendente para sempre (nunca resolvida) — mesmo
      // padrão já usado neste código-base para representar uma requisição
      // "em voo" (ver `article-health-checklist.spec.tsx`, "estado
      // inicial: mostra Carregando...").
      const fetchMock = mockFetch({ transition: () => new Promise<Response>(() => {}) });
      renderPanel('DRAFT');

      await user.click(await screen.findByRole('button', { name: 'Status e ações do Artigo' }));
      const healthCallsBeforeTransition = fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/health'),
      ).length;

      await user.click(await screen.findByRole('button', { name: 'Enviar para revisão' }));
      expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled();

      act(() => {
        changeListeners[0]({ matches: true });
      });

      // o drawer fechou (mesma modalidade que sidebar-nav.tsx: matchMedia
      // reseta isMobileOpen, sem desmontar a subtree).
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // pendingAction sobrevive — o botão continua "Enviando...", desabilitado,
      // porque ArticleTransitionPanel NUNCA desmontou.
      expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
      // /health não refez por causa do cruzamento de breakpoint.
      const healthCallsAfterCross = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/health')).length;
      expect(healthCallsAfterCross).toBe(healthCallsBeforeTransition);
    });

    it('cruzar para desktop sem o drawer aberto: nenhum efeito (idempotente)', async () => {
      const changeListeners: Array<(event: { matches: boolean }) => void> = [];
      const addEventListener = jest.fn((type: string, listener: (event: { matches: boolean }) => void) => {
        if (type === 'change') {
          changeListeners.push(listener);
        }
      });
      const mediaQueryListStub = {
        matches: false,
        media: '(min-width: 1024px)',
        addEventListener,
        removeEventListener: jest.fn(),
      };
      window.matchMedia = jest.fn().mockReturnValue(mediaQueryListStub) as unknown as typeof window.matchMedia;

      mockFetch();
      renderPanel('DRAFT');

      // Este teste, ao contrário de todos os outros do arquivo, não faz
      // nenhuma interação (`user.click`) nem `findBy*` antes de concluir —
      // por isso é o único caso em que as duas atualizações assíncronas de
      // `ArticleHealthChecklist` (`setHealthState`/`setCatalogState`,
      // health + catálogo, ambas disparadas na montagem) resolveriam fora
      // de qualquer `act()`. Aguardar o texto do indicador (só depende de
      // `healthState`) dá a oportunidade de as duas assentarem antes de
      // prosseguir, sem alterar a lógica de produção nem enfraquecer a
      // asserção original (idempotência do cruzamento de breakpoint).
      await screen.findByText('Rascunho · Sem pendências');

      act(() => {
        changeListeners[0]({ matches: true });
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
