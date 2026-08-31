import type { ContextType, ReactElement } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { SidebarNav } from './sidebar-nav';
import { UnsavedChangesProvider, useSyncFormDirty } from './unsaved-changes-context';

/**
 * Mesmo harness de `authenticated-shell.spec.tsx`/`guarded-link.spec.tsx`:
 * `RouterContext` (legado, lido internamente por `next/link`),
 * `AppRouterContext` (`useRouter()`, usado por `GuardedLink`) e
 * `PathnameContext` (`usePathname()`, próprio de `SidebarNav`).
 */
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: mockPush,
  replace: mockReplace,
  prefetch: jest.fn(),
};

const mockLegacyRouter = {
  pathname: '/fastcompre/categories',
  asPath: '/fastcompre/categories',
  push: mockPush,
  replace: mockReplace,
  prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

function DirtyPublisher({ isDirty }: { isDirty: boolean }) {
  useSyncFormDirty(isDirty);
  return null;
}

/**
 * Constrói a árvore (não renderiza) para permitir reuso tanto no render
 * inicial quanto em `rerender(...)` com um `pathname` diferente — é assim
 * que os testes de fechamento por navegação simulam uma troca de rota
 * real sem depender de um router de verdade.
 */
function buildTree(pathname: string, isDirty = false): ReactElement {
  return (
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>
          <UnsavedChangesProvider>
            <DirtyPublisher isDirty={isDirty} />
            <SidebarNav siteSlug="fastcompre" />
          </UnsavedChangesProvider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>
  );
}

function renderSidebarNav(pathname: string, isDirty = false) {
  return render(buildTree(pathname, isDirty));
}

describe('SidebarNav', () => {
  afterEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    jest.restoreAllMocks();
    // Alguns testes stubam `window.matchMedia` (jsdom não o implementa —
    // ver describe dedicado abaixo); garante que nenhum teste subsequente
    // herde o stub de um anterior.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('renderiza os 5 itens (Dashboard, Artigos, Produtos, Categorias, Autores) com o href correto', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/fastcompre');
    expect(screen.getByRole('link', { name: 'Artigos' })).toHaveAttribute('href', '/fastcompre/articles');
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/fastcompre/products');
    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('href', '/fastcompre/categories');
    expect(screen.getByRole('link', { name: 'Autores' })).toHaveAttribute('href', '/fastcompre/authors');
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('landmark de navegação com aria-label "Navegação do Site"', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('navigation', { name: 'Navegação do Site' })).toBeInTheDocument();
  });

  it('item ativo (rota de listagem exata) recebe aria-current="page"; os demais não', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Produtos' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Artigos' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Autores' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  // --- UXA-017: Dashboard como destination raiz ---

  it('Dashboard: ativo (aria-current="page") somente na rota raiz exata (/:siteSlug)', () => {
    renderSidebarNav('/fastcompre');

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Artigos' })).not.toHaveAttribute('aria-current');
  });

  it.each(['/fastcompre/articles', '/fastcompre/products', '/fastcompre/categories', '/fastcompre/authors'])(
    'Dashboard: NÃO recebe aria-current em %s, mesmo sendo prefixo textual de toda rota do Site',
    (pathname) => {
      renderSidebarNav(pathname);

      expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    },
  );

  it('rota de criação (/categories/new) mantém "Categorias" como seção ativa', () => {
    renderSidebarNav('/fastcompre/categories/new');

    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('aria-current', 'page');
  });

  it('rota de detalhe (/categories/:id) mantém "Categorias" como seção ativa', () => {
    renderSidebarNav('/fastcompre/categories/11111111-1111-4111-8111-111111111111');

    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('aria-current', 'page');
  });

  it('uma rota-irmã com prefixo textual parecido não marca a seção como ativa por engano', () => {
    renderSidebarNav('/fastcompre/categories-archive');

    expect(screen.getByRole('link', { name: 'Categorias' })).not.toHaveAttribute('aria-current');
  });

  it('sem alterações não salvas: item de navegação comporta-se como Link comum', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories', false);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/fastcompre/products', expect.anything());
  });

  it('com alterações não salvas: clicar num item da sidebar abre a confirmação (UXA-003)', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories', true);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(mockPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products'));
  });

  it('sem violação de acessibilidade (jest-axe) com o drawer fechado', async () => {
    const { container } = renderSidebarNav('/fastcompre/categories');

    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXA-008: drawer responsivo ---

  it('trigger "Menu": drawer fechado por padrão, aria-haspopup/aria-expanded/aria-controls corretos', () => {
    const { container } = renderSidebarNav('/fastcompre/categories');

    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('id', controlsId);
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('estrutural: navegação persistente usa "hidden" + "lg:flex-col" (rail vertical) e o trigger usa "lg:hidden" (não prova responsividade — ver medição real no relatório)', () => {
    renderSidebarNav('/fastcompre/categories');

    const persistentNav = screen.getByRole('navigation', { name: 'Navegação do Site' });
    expect(persistentNav.className).toContain('hidden');
    expect(persistentNav.className).toContain('lg:flex-col');
    expect(screen.getByRole('button', { name: 'Menu' }).className).toContain('lg:hidden');
  });

  // --- UXA-019B: rail lateral vertical, branding e ícones decorativos ---

  it('UXA-019B: o nav persistente usa layout vertical ("flex-col" na classe do container da lista)', () => {
    renderSidebarNav('/fastcompre/categories');

    const persistentNav = screen.getByRole('navigation', { name: 'Navegação do Site' });
    const list = persistentNav.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list?.className).toContain('flex-col');
  });

  it('UXA-019B: cada ícone decorativo tem aria-hidden="true" e não altera o nome acessível do link', () => {
    renderSidebarNav('/fastcompre/categories');

    const persistentNav = screen.getByRole('navigation', { name: 'Navegação do Site' });
    const links = within(persistentNav).getAllByRole('link');
    expect(links).toHaveLength(5);

    for (const link of links) {
      const icon = link.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }

    // Confirma que o nome acessível de cada link continua sendo exatamente
    // o texto do label — nenhum texto/label do ícone foi concatenado.
    expect(within(persistentNav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(persistentNav).getByRole('link', { name: 'Artigos' })).toBeInTheDocument();
    expect(within(persistentNav).getByRole('link', { name: 'Produtos' })).toBeInTheDocument();
    expect(within(persistentNav).getByRole('link', { name: 'Categorias' })).toBeInTheDocument();
    expect(within(persistentNav).getByRole('link', { name: 'Autores' })).toBeInTheDocument();
  });

  // --- UXA-019C: pílula ativa, marca compacta mobile, copyright do rail ---

  it('UXA-019C: item ativo recebe rounded-pill (radius mais evidente); inativos mantêm rounded-control — sem depender só de cor', () => {
    renderSidebarNav('/fastcompre/categories');

    const activeLink = screen.getByRole('link', { name: 'Categorias' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    const activeClasses = activeLink.className.split(/\s+/);
    expect(activeClasses).toContain('rounded-pill');
    // `no-underline` (reset de base, presente em todo item) contém a
    // substring "underline" — por isso a checagem é por token exato via
    // split(), não `toContain` na string crua.
    expect(activeClasses).not.toContain('underline');

    const inactiveLink = screen.getByRole('link', { name: 'Produtos' });
    expect(inactiveLink).not.toHaveAttribute('aria-current');
    expect(inactiveLink.className).toContain('rounded-control');
  });

  it('UXA-019C: mobile fechado não renderiza nenhuma marca "FC" — nenhuma duplicação do branding fora do rail/drawer', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.queryByText('FC')).not.toBeInTheDocument();
    // "FastCompre" aparece 2x no documento — rail persistente + cabeçalho
    // do drawer (sempre no DOM, mesmo fechado; `<dialog>` só oculta via UA
    // stylesheet) — as duas ocorrências legítimas. Uma terceira indicaria
    // uma marca solta ao lado do trigger "Menu", que este teste garante
    // que não existe.
    expect(screen.getAllByText('FastCompre')).toHaveLength(2);
  });

  it('UXA-019C: copyright estático aparece no rodapé do rail desktop, mas não dentro do drawer mobile', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    const persistentNav = screen.getByRole('navigation', { name: 'Navegação do Site' });
    expect(within(persistentNav).getByText('© 2026 FastCompre. Todos os direitos reservados.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });
    expect(within(dialog).queryByText('© 2026 FastCompre. Todos os direitos reservados.')).not.toBeInTheDocument();
  });

  it('UXA-019C: sem violação de acessibilidade (jest-axe) com a pílula ativa e o copyright do rail', async () => {
    const { container } = renderSidebarNav('/fastcompre/categories');

    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXA-019C: densidade compacta ---

  it('UXA-019C: botão "Menu" (hambúrguer) aplica data-density="compact"', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('data-density', 'compact');
  });

  it('UXA-019C: nav persistente (rail) aplica data-density="compact"', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('navigation', { name: 'Navegação do Site' })).toHaveAttribute(
      'data-density',
      'compact',
    );
  });

  it('abrir o drawer: foco inicial em "Fechar menu", aria-expanded vira true, itens aparecem na ordem correta depois do botão', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');

    const closeButton = within(dialog).getByRole('button', { name: 'Fechar menu' });
    expect(closeButton).toHaveFocus();

    const focusable = within(dialog).getAllByRole('button').concat(within(dialog).getAllByRole('link'));
    const labels = focusable.map((element) => element.textContent);
    expect(labels).toEqual(['Fechar menu', 'Dashboard', 'Artigos', 'Produtos', 'Categorias', 'Autores']);
  });

  it('UXA-019B: cabeçalho do drawer mostra o branding "FastCompre"/"ADMIN", que não é focável e não conta entre os elementos interativos', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    expect(within(dialog).getByText('FastCompre')).toBeInTheDocument();
    expect(within(dialog).getByText('ADMIN')).toBeInTheDocument();

    // Mesma contagem/ordem de antes — o branding não introduz um novo botão
    // ou link focável no drawer.
    const focusable = within(dialog).getAllByRole('button').concat(within(dialog).getAllByRole('link'));
    expect(focusable.map((element) => element.textContent)).toEqual([
      'Fechar menu',
      'Dashboard',
      'Artigos',
      'Produtos',
      'Categorias',
      'Autores',
    ]);
  });

  it('UXA-019B: ícone do botão "Fechar menu" tem aria-hidden="true"', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    const closeIcon = within(dialog).getByRole('button', { name: 'Fechar menu' }).querySelector('svg');
    expect(closeIcon).not.toBeNull();
    expect(closeIcon).toHaveAttribute('aria-hidden', 'true');
  });

  it('Escape fecha o drawer e devolve o foco ao trigger (comportamento nativo do <dialog>)', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('clique no backdrop (no próprio elemento <dialog>, fora do conteúdo) fecha o drawer e devolve o foco ao trigger', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebarNav('/fastcompre/categories');

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    const dialogElement = container.querySelector('dialog') as HTMLDialogElement;
    fireEvent.click(dialogElement, { target: dialogElement });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clique em "Fechar menu" fecha o drawer e devolve o foco ao trigger', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories');

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.click(within(dialog).getByRole('button', { name: 'Fechar menu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clique num link do drawer (sem alterações pendentes) fecha o drawer somente depois que o pathname muda de fato', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSidebarNav('/fastcompre/categories', false);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.click(within(dialog).getByRole('link', { name: 'Produtos' }));

    // navegação disparada, mas o pathname (controlado pelo teste) ainda não
    // mudou — o drawer deve continuar aberto até a "navegação" se refletir.
    expect(mockPush).toHaveBeenCalledWith('/fastcompre/products', expect.anything());
    expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();

    // simula a navegação concluída: pathname muda de verdade.
    rerender(buildTree('/fastcompre/products', false));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('não fecha o drawer quando a árvore rerenderiza com o mesmo pathname', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSidebarNav('/fastcompre/categories', false);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    // rerender com o MESMO pathname — não deve fechar o drawer.
    rerender(buildTree('/fastcompre/categories', false));

    expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();
  });

  it('com alterações não salvas: escolher "Ficar" mantém o drawer aberto porque o pathname não muda', async () => {
    const user = userEvent.setup();
    renderSidebarNav('/fastcompre/categories', true);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.click(within(drawer).getByRole('link', { name: 'Produtos' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(mockPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    expect(screen.queryByRole('dialog', { name: 'Alterações não salvas' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();
  });

  it('com alterações não salvas: escolher "Sair sem salvar" fecha o drawer quando o pathname muda', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSidebarNav('/fastcompre/categories', true);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    await user.click(within(drawer).getByRole('link', { name: 'Produtos' }));
    await screen.findByRole('dialog', { name: 'Alterações não salvas' });

    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products'));

    // drawer continua aberto até o pathname realmente mudar.
    expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();

    rerender(buildTree('/fastcompre/products', true));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu de navegação' })).not.toBeInTheDocument());
  });

  it('sem violação de acessibilidade (jest-axe) com o drawer aberto', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebarNav('/fastcompre/categories');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog', { name: 'Menu de navegação' });

    expect(await axe(container)).toHaveNoViolations();
  });

  /**
   * jsdom não implementa `window.matchMedia` (confirmado empiricamente:
   * `typeof window.matchMedia` é `undefined` nesta suíte) — por isso este
   * bloco stuba `matchMedia` localmente, só para exercitar a ligação
   * addEventListener/removeEventListener e o efeito de fechar o `<dialog>`
   * quando a media query passa a bater. Isto prova a lógica de wiring do
   * componente, NÃO que o breakpoint real de 1024px dispara essa
   * transição num navegador de verdade — essa prova é a medição empírica
   * em Chromium real reportada separadamente, não este teste.
   */
  describe('fechamento na transição para lg+ (matchMedia)', () => {
    it('assina "change" em matchMedia(lg), fecha o drawer aberto quando a query passa a bater, e remove o listener no unmount', () => {
      const changeListeners: Array<(event: { matches: boolean }) => void> = [];
      const addEventListener = jest.fn((type: string, listener: (event: { matches: boolean }) => void) => {
        if (type === 'change') {
          changeListeners.push(listener);
        }
      });
      const removeEventListener = jest.fn();
      const mediaQueryListStub = {
        matches: false,
        media: '(min-width: 1024px)',
        addEventListener,
        removeEventListener,
      };
      const matchMediaStub = jest.fn().mockReturnValue(mediaQueryListStub);
      window.matchMedia = matchMediaStub as unknown as typeof window.matchMedia;

      const { unmount } = renderSidebarNav('/fastcompre/categories');

      expect(matchMediaStub).toHaveBeenCalledWith('(min-width: 1024px)');
      expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(changeListeners).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
      expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();

      // simula a transição real para lg+ enquanto o drawer está aberto.
      act(() => {
        changeListeners[0]({ matches: true });
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const registeredHandler = addEventListener.mock.calls[0][1];
      unmount();

      expect(removeEventListener).toHaveBeenCalledWith('change', registeredHandler);
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    it('não fecha nada quando a media query muda para não-desktop (matches: false)', () => {
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

      renderSidebarNav('/fastcompre/categories');

      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
      expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();

      act(() => {
        changeListeners[0]({ matches: false });
      });

      expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();
    });
  });
});
