import type { ContextType, ReactElement } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { PublicCategory } from '@commerce-platform/contracts';
import { CategoryNav } from './category-nav';

/**
 * apps/fastcompre/src/app/category-nav.spec.tsx
 *
 * UXW-003 — estrutura/`aria-current` da navegação de Categorias.
 * UXW-004 — trigger mobile + `<dialog>` (drawer). A partir desta tarefa, o
 * componente é intrinsecamente interativo (abrir/fechar, foco, `Escape`,
 * `matchMedia`) — por isso este spec migrou inteiramente para Testing
 * Library (`render()`), mesmo padrão/harness já comprovado em
 * `apps/admin/src/app/[siteSlug]/sidebar-nav.spec.tsx` (UXA-008), em vez
 * de misturar com o `renderToStaticMarkup` usado quando o componente só
 * tinha estrutura estática. `apps/fastcompre` não depende de
 * `@testing-library/jest-dom` (só `apps/admin` depende) — por isso nenhum
 * matcher `toHaveAttribute`/`toBeInTheDocument`/`toHaveFocus` é usado
 * aqui; todas as asserções usam a API de DOM padrão
 * (`getAttribute`/`document.activeElement`/`queryByRole(...) === null`),
 * mesma disciplina já usada em `product-block.spec.tsx`.
 *
 * `RouterContext` (legado, lido por `next/link`) + `AppRouterContext`
 * (não usado por este componente, mas parte do mesmo harness já
 * comprovado) + `PathnameContext` (`usePathname()`) — mesmo padrão de
 * `sidebar-nav.spec.tsx`.
 *
 * Duas apresentações da mesma lista coexistem no DOM (navegação
 * persistente `sm+` e o `<dialog>` do drawer, controladas por CSS —
 * `hidden sm:block`/`sm:hidden` — que o jsdom não avalia; a real exclusão
 * de acessibilidade vem da semântica nativa de `<dialog>` fechado, que
 * `dom-accessibility-api`/Testing Library já respeitam). Por isso toda
 * asserção depois que o drawer é aberto usa `within(dialog)`/
 * `within(persistentNav)` para não ficar ambígua entre as duas cópias —
 * nunca `getAllByRole('link')` sem escopo nesse estado.
 *
 * Fechamento por clique no backdrop **não é testado aqui** — decisão
 * fechada no desenho técnico da UXW-004 (não é critério do backlog, não é
 * implementado por este componente).
 */
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

const mockLegacyRouter = {
  pathname: '/',
  asPath: '/',
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const CATEGORIES: PublicCategory[] = [
  { name: 'Comparativos', slug: 'comparativos' },
  { name: 'Cafeteiras', slug: 'cafeteiras' },
];

function buildTree(pathname: string): ReactElement {
  return (
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>
          <CategoryNav categories={CATEGORIES} />
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>
  );
}

function renderCategoryNav(pathname: string) {
  return render(buildTree(pathname));
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Categorias' }));
  return screen.findByRole('dialog', { name: 'Categorias' });
}

describe('CategoryNav', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // Alguns testes stubam `window.matchMedia` (jsdom não o implementa) —
    // garante que nenhum teste subsequente herde o stub de um anterior,
    // mesmo cuidado já usado em `sidebar-nav.spec.tsx`.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('navegação persistente: landmark <nav aria-label="Categorias"> com um link por Categoria, na ordem recebida, com href correto', () => {
    renderCategoryNav('/');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe('Comparativos');
    expect(links[0].getAttribute('href')).toBe('/comparativos');
    expect(links[1].textContent).toBe('Cafeteiras');
    expect(links[1].getAttribute('href')).toBe('/cafeteiras');
  });

  it('em "/" (Home), nenhum item recebe aria-current', () => {
    renderCategoryNav('/');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });

  it('na rota exata de uma Categoria, só ela recebe aria-current="page"', () => {
    renderCategoryNav('/comparativos');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    expect(within(nav).getByRole('link', { name: 'Comparativos' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Cafeteiras' }).getAttribute('aria-current')).toBeNull();
  });

  it('num Artigo sob a Categoria, só ela recebe aria-current="location" (nunca "page")', () => {
    renderCategoryNav('/comparativos/melhor-fone-bluetooth');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    expect(within(nav).getByRole('link', { name: 'Comparativos' }).getAttribute('aria-current')).toBe(
      'location',
    );
    expect(within(nav).getByRole('link', { name: 'Cafeteiras' }).getAttribute('aria-current')).toBeNull();
  });

  it('em pathname sem Categoria correspondente, nenhum item fica ativo', () => {
    renderCategoryNav('/rota-sem-categoria');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });

  it('todo link da navegação persistente é um <a href> real, sem tabindex negativo — alcançável nativamente por teclado', () => {
    renderCategoryNav('/');

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).not.toBeNull();
      expect(link.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  describe('trigger mobile', () => {
    it('é um <button> com nome acessível "Categorias" e ARIA de abertura de diálogo, inicialmente fechado', () => {
      renderCategoryNav('/');

      const trigger = screen.getByRole('button', { name: 'Categorias' });
      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger.getAttribute('type')).toBe('button');
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-controls')).not.toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('clique no trigger abre o <dialog aria-label="Categorias"> e marca aria-expanded="true"', async () => {
      const user = userEvent.setup();
      renderCategoryNav('/');

      const trigger = screen.getByRole('button', { name: 'Categorias' });
      await openDrawer(user);

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(trigger.getAttribute('aria-controls')).toBe(
        screen.getByRole('dialog', { name: 'Categorias' }).id,
      );
    });

    it('o botão "Fechar" recebe foco inicial ao abrir o drawer', async () => {
      const user = userEvent.setup();
      renderCategoryNav('/');

      const dialog = await openDrawer(user);
      const closeButton = within(dialog).getByRole('button', { name: 'Fechar' });

      expect(document.activeElement).toBe(closeButton);
    });

    it('clique em "Fechar" fecha o drawer, marca aria-expanded="false" e devolve o foco ao trigger', async () => {
      const user = userEvent.setup();
      renderCategoryNav('/');

      const trigger = screen.getByRole('button', { name: 'Categorias' });
      const dialog = await openDrawer(user);

      await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });

    it('Escape fecha o drawer e devolve o foco ao trigger (comportamento nativo do <dialog>, reproduzido pelo polyfill de teste)', async () => {
      const user = userEvent.setup();
      renderCategoryNav('/');

      const trigger = screen.getByRole('button', { name: 'Categorias' });
      await openDrawer(user);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it('a mesma lista de Categorias (mesma lógica de aria-current) aparece dentro do drawer', async () => {
      const user = userEvent.setup();
      renderCategoryNav('/comparativos');

      const dialog = await openDrawer(user);
      const links = within(dialog).getAllByRole('link');

      expect(links).toHaveLength(2);
      expect(within(dialog).getByRole('link', { name: 'Comparativos' }).getAttribute('aria-current')).toBe(
        'page',
      );
      expect(within(dialog).getByRole('link', { name: 'Cafeteiras' }).getAttribute('aria-current')).toBeNull();
      expect(within(dialog).getByRole('link', { name: 'Comparativos' }).getAttribute('href')).toBe(
        '/comparativos',
      );
    });

    it('clique num link do drawer fecha o drawer somente depois que o pathname muda de fato', async () => {
      const user = userEvent.setup();
      const { rerender } = renderCategoryNav('/');

      const dialog = await openDrawer(user);
      await user.click(within(dialog).getByRole('link', { name: 'Comparativos' }));

      // `next/link` sob este harness não navega de verdade — o pathname só
      // muda quando o teste rerenderiza com um valor novo, simulando a
      // navegação concluída. Até lá, o drawer permanece aberto.
      expect(screen.getByRole('dialog', { name: 'Categorias' })).toBeTruthy();

      rerender(buildTree('/comparativos'));

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('não fecha o drawer quando a árvore rerenderiza com o mesmo pathname', async () => {
      const user = userEvent.setup();
      const { rerender } = renderCategoryNav('/');

      await openDrawer(user);
      rerender(buildTree('/'));

      expect(screen.getByRole('dialog', { name: 'Categorias' })).toBeTruthy();
    });

    /**
     * jsdom não implementa `window.matchMedia` — stub local, só para
     * exercitar o wiring `addEventListener`/`removeEventListener` e o
     * efeito de fechar o `<dialog>` quando a media query passa a bater.
     * Isto prova a lógica de wiring do componente, NÃO que o breakpoint
     * real de 640px dispara essa transição num navegador de verdade —
     * essa prova é a medição empírica em Chromium real já reportada no
     * desenho técnico, não este teste.
     */
    describe('fechamento na transição para sm+ (matchMedia)', () => {
      it('assina "change" em matchMedia(sm), fecha o drawer aberto quando a query passa a bater, e remove o listener no unmount', async () => {
        const user = userEvent.setup();
        const changeListeners: Array<(event: { matches: boolean }) => void> = [];
        const addEventListener = jest.fn(
          (type: string, listener: (event: { matches: boolean }) => void) => {
            if (type === 'change') {
              changeListeners.push(listener);
            }
          },
        );
        const removeEventListener = jest.fn();
        const mediaQueryListStub = {
          matches: false,
          media: '(min-width: 640px)',
          addEventListener,
          removeEventListener,
        };
        const matchMediaStub = jest.fn().mockReturnValue(mediaQueryListStub);
        window.matchMedia = matchMediaStub as unknown as typeof window.matchMedia;

        const { unmount } = renderCategoryNav('/');

        expect(matchMediaStub).toHaveBeenCalledWith('(min-width: 640px)');
        expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(changeListeners).toHaveLength(1);

        await openDrawer(user);

        act(() => {
          changeListeners[0]({ matches: true });
        });

        expect(screen.queryByRole('dialog')).toBeNull();

        const registeredHandler = addEventListener.mock.calls[0][1];
        unmount();

        expect(removeEventListener).toHaveBeenCalledWith('change', registeredHandler);
        expect(removeEventListener).toHaveBeenCalledTimes(1);
      });

      it('não fecha nada quando a media query muda para não-desktop (matches: false)', async () => {
        const user = userEvent.setup();
        const changeListeners: Array<(event: { matches: boolean }) => void> = [];
        const addEventListener = jest.fn(
          (type: string, listener: (event: { matches: boolean }) => void) => {
            if (type === 'change') {
              changeListeners.push(listener);
            }
          },
        );
        const mediaQueryListStub = {
          matches: false,
          media: '(min-width: 640px)',
          addEventListener,
          removeEventListener: jest.fn(),
        };
        window.matchMedia = jest.fn().mockReturnValue(mediaQueryListStub) as unknown as typeof window.matchMedia;

        renderCategoryNav('/');
        await openDrawer(user);

        act(() => {
          changeListeners[0]({ matches: false });
        });

        expect(screen.getByRole('dialog', { name: 'Categorias' })).toBeTruthy();
      });
    });
  });

  it.each([
    ['drawer fechado', '/'],
    ['rota exata de Categoria (drawer fechado)', '/comparativos'],
  ])('não tem violação de acessibilidade (jest-axe) — %s', async (_label, pathname) => {
    const { container } = renderCategoryNav(pathname);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('não tem violação de acessibilidade (jest-axe) — drawer aberto', async () => {
    const user = userEvent.setup();
    const { container } = renderCategoryNav('/');

    await openDrawer(user);

    expect(await axe(container)).toHaveNoViolations();
  });
});
