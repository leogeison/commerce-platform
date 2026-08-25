import type { ContextType, ReactElement } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { Role } from '@commerce-platform/contracts';
import { CommandPalette, matchesQuery } from './command-palette';
import { UnsavedChangesProvider, useSyncFormDirty } from './unsaved-changes-context';

/**
 * Mesmo harness de `sidebar-nav.spec.tsx`, sem `RouterContext` legado —
 * `CommandPalette` nunca renderiza `next/link`/`GuardedLink` (navegação é
 * programática via `useRouter().push()`, precedida de `confirmLeave()`),
 * então só `AppRouterContext` (`useRouter()`) e `PathnameContext`
 * (`usePathname()`) são necessários.
 */
const mockPush = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
};

function DirtyPublisher({ isDirty }: { isDirty: boolean }) {
  useSyncFormDirty(isDirty);
  return null;
}

/**
 * `isOpen` controlado por um wrapper local — mesmo papel que
 * `AuthenticatedShell` desempenha em produção. Expor `setIsOpen` via
 * `data-testid`/callback não é necessário: os testes abrem/fecham a
 * paleta pelos mesmos caminhos reais (atalho global, `Escape`, backdrop),
 * exatamente como um usuário faria.
 *
 * UXA-010: `role` é um parâmetro novo, com default `'VIEWER'` — não
 * `'EDITOR'`/`'OWNER'` — deliberadamente, para que todos os testes
 * herdados da UXA-009 (que não passam `role` e esperam exatamente os 4
 * destinos de navegação, sem grupo "Criar") continuem válidos sem
 * nenhuma alteração: com `VIEWER`, `createResults` é sempre vazio, então
 * o comportamento observado é idêntico ao de antes desta tarefa. Os
 * testes específicos da matriz de Role passam `role` explicitamente.
 */
function ControlledPalette({
  pathname,
  isDirty = false,
  role = 'VIEWER',
}: {
  pathname: string;
  isDirty?: boolean;
  role?: Role;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <PathnameContext.Provider value={pathname}>
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <DirtyPublisher isDirty={isDirty} />
          <CommandPalette
            id="command-palette-test"
            siteSlug="fastcompre"
            role={role}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
          />
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>
    </PathnameContext.Provider>
  );
}

function buildTree(pathname: string, isDirty = false, role: Role = 'VIEWER'): ReactElement {
  return <ControlledPalette pathname={pathname} isDirty={isDirty} role={role} />;
}

function pressShortcut() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
}

describe('matchesQuery', () => {
  it('query vazia (ou só espaços) casa com qualquer rótulo', () => {
    expect(matchesQuery('Artigos', '')).toBe(true);
    expect(matchesQuery('Artigos', '   ')).toBe(true);
  });

  it('substring simples é case-insensitive', () => {
    expect(matchesQuery('Artigos', 'art')).toBe(true);
    expect(matchesQuery('Artigos', 'ART')).toBe(true);
  });

  it('subsequência não contígua casa (não é includes())', () => {
    expect(matchesQuery('Produtos', 'pdt')).toBe(true);
  });

  it('query sem correspondência não casa', () => {
    expect(matchesQuery('Produtos', 'xyz')).toBe(false);
  });

  it('ordem importa — letras fora de ordem não casam', () => {
    expect(matchesQuery('Autores', 'srotua')).toBe(false);
  });
});

describe('CommandPalette', () => {
  afterEach(() => {
    mockPush.mockClear();
  });

  it('abre pelo atalho global (Ctrl+K) com foco inicial no campo de busca', () => {
    render(buildTree('/fastcompre/categories'));

    act(() => pressShortcut());

    const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
    expect(input).toHaveFocus();
  });

  it('abre pelo atalho global também com Cmd+K (metaKey)', () => {
    render(buildTree('/fastcompre/categories'));

    act(() => fireEvent.keyDown(document, { key: 'k', metaKey: true }));

    expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();
  });

  it('com query vazia, lista os 4 destinos e a primeira opção fica ativa', () => {
    render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Artigos', 'Produtos', 'Categorias', 'Autores']);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('digitação filtra a lista e reseta a opção ativa para a primeira', async () => {
    const user = userEvent.setup();
    render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'pdt');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Produtos']);
  });

  it('sem resultado, mostra estado vazio e nenhuma opção', async () => {
    const user = userEvent.setup();
    render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'xyz');

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum resultado encontrado');
  });

  it('ArrowDown/ArrowUp movem aria-activedescendant sem tirar o foco do input', async () => {
    const user = userEvent.setup();
    render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
    await user.keyboard('{ArrowDown}');

    const produtos = screen.getByRole('option', { name: 'Produtos' });
    expect(input).toHaveAttribute('aria-activedescendant', produtos.id);
    expect(input).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    const artigos = screen.getByRole('option', { name: 'Artigos' });
    expect(input).toHaveAttribute('aria-activedescendant', artigos.id);
  });

  it('Enter no item ativo navega (sem alteração pendente) e fecha só após o pathname mudar', async () => {
    const user = userEvent.setup();
    const { rerender } = render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    await user.keyboard('{ArrowDown}'); // ativa "Produtos"
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products'));
    // ainda não fechou — pathname (controlado pelo teste) ainda não mudou.
    expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();

    rerender(buildTree('/fastcompre/products'));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Buscar navegação' })).not.toBeInTheDocument());
  });

  it('com alterações não salvas, escolher "Ficar" mantém a paleta aberta e não navega', async () => {
    const user = userEvent.setup();
    render(buildTree('/fastcompre/categories', true));
    act(() => pressShortcut());

    await user.keyboard('{Enter}'); // ativa "Artigos" (primeira opção)

    const stayButton = await screen.findByRole('button', { name: 'Ficar' });
    await user.click(stayButton);

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();
  });

  it('Escape fecha e devolve foco a quem tinha foco antes da abertura', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Fora da paleta</button>
        {buildTree('/fastcompre/categories')}
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Fora da paleta' });
    trigger.focus();
    act(() => pressShortcut());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('clique no backdrop fecha a paleta', () => {
    render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    const dialog = document.querySelector('dialog');
    fireEvent.click(dialog as Element);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('botão "Fechar busca rápida" fecha a paleta e devolve foco a quem tinha foco antes da abertura', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Fora da paleta</button>
        {buildTree('/fastcompre/categories')}
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Fora da paleta' });
    trigger.focus();
    act(() => pressShortcut());

    const closeButton = screen.getByRole('button', { name: 'Fechar busca rápida' });
    await user.click(closeButton);

    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  describe('wrap de fronteira do Tab (achado empírico: <dialog> nativo não fecha o ciclo sozinho)', () => {
    it('Tab no botão de fechar (última parada) volta o foco para o input, sem passar por document.body', () => {
      render(buildTree('/fastcompre/categories'));
      act(() => pressShortcut());

      const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
      const closeButton = screen.getByRole('button', { name: 'Fechar busca rápida' });
      const dialog = document.querySelector('dialog') as HTMLDialogElement;

      closeButton.focus();
      expect(closeButton).toHaveFocus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
      act(() => {
        fireEvent(dialog, event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(input).toHaveFocus();
      expect(document.body).not.toHaveFocus();
    });

    it('Shift+Tab no input (primeira parada) vai para o botão de fechar, sem passar por document.body', () => {
      render(buildTree('/fastcompre/categories'));
      act(() => pressShortcut());

      const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
      const closeButton = screen.getByRole('button', { name: 'Fechar busca rápida' });
      const dialog = document.querySelector('dialog') as HTMLDialogElement;

      expect(input).toHaveFocus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
      act(() => {
        fireEvent(dialog, event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(closeButton).toHaveFocus();
    });

    it('Tab fora das fronteiras (ex.: no próprio input) não é interceptado — navegação nativa segue livre', () => {
      render(buildTree('/fastcompre/categories'));
      act(() => pressShortcut());

      const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(input).toHaveFocus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
      act(() => {
        fireEvent(dialog, event);
      });

      // Tab a partir do input (não é fronteira) não é do handler — permanece não interceptado.
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it('sessão determinística: abrir → alterar busca/seleção → fechar → reabrir → query vazia e primeira opção ativa', async () => {
    const user = userEvent.setup();
    render(buildTree('/fastcompre/categories'));

    act(() => pressShortcut());
    const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
    await user.type(input, 'aut');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('aut');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());

    act(() => pressShortcut());
    const reopenedInput = screen.getByRole('combobox', { name: 'Buscar navegação' });
    expect(reopenedInput).toHaveValue('');
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Artigos', 'Produtos', 'Categorias', 'Autores']);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(reopenedInput).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('cleanup: listener global de teclado é removido no unmount', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = render(buildTree('/fastcompre/categories'));

    const keydownCall = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'keydown');
    if (!keydownCall) {
      throw new Error('esperava um addEventListener("keydown", ...) registrado por CommandPalette.');
    }
    const registeredHandler = keydownCall[1];

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', registeredHandler);
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('política de concorrência modal', () => {
    it('atalho com a paleta já aberta: preventDefault, mas não reabre/reseta', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'pdt');

      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toHaveValue('pdt');
    });

    it('outro <dialog open> presente: ignora sem preventDefault e não abre', () => {
      render(
        <div>
          <dialog open aria-label="Outro modal" />
          {buildTree('/fastcompre/categories')}
        </div>,
      );

      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByRole('combobox', { name: 'Buscar navegação' })).not.toBeInTheDocument();
    });

    it('sem modal concorrente: preventDefault e abre', () => {
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
      render(buildTree('/fastcompre/categories'));

      act(() => {
        document.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();
    });

    it('não é o atalho (ex.: só "k" sem modificador): ignora completamente', () => {
      const event = new KeyboardEvent('keydown', { key: 'k', cancelable: true });
      render(buildTree('/fastcompre/categories'));

      act(() => {
        document.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByRole('combobox', { name: 'Buscar navegação' })).not.toBeInTheDocument();
    });
  });

  it('jest-axe: nenhuma violação com a paleta aberta e com resultado', async () => {
    const { container } = render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());

    expect(await axe(container)).toHaveNoViolations();
  });

  it('jest-axe: nenhuma violação no estado "sem resultado"', async () => {
    const user = userEvent.setup();
    const { container } = render(buildTree('/fastcompre/categories'));
    act(() => pressShortcut());
    await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'xyz');

    expect(await axe(container)).toHaveNoViolations();
  });

  /**
   * UXA-010 — matriz de Role × visibilidade dos 4 atalhos de criação, e
   * comportamento de agrupamento/busca/navegação/dirty-state associado.
   */
  describe('UXA-010 — ações de criação', () => {
    it('VIEWER: só os 4 destinos de navegação, sem grupo "Criar"', () => {
      render(buildTree('/fastcompre/categories', false, 'VIEWER'));
      act(() => pressShortcut());

      expect(screen.getAllByRole('option')).toHaveLength(4);
      expect(screen.getByRole('group', { name: 'Navegar' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Criar' })).not.toBeInTheDocument();
    });

    it.each<Role>(['EDITOR', 'OWNER'])(
      '%s: os 4 destinos de navegação e os 4 atalhos de criação, em dois grupos',
      (role) => {
        render(buildTree('/fastcompre/categories', false, role));
        act(() => pressShortcut());

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(8);
        expect(screen.getByRole('group', { name: 'Navegar' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Criar' })).toBeInTheDocument();

        const createGroup = screen.getByRole('group', { name: 'Criar' });
        expect(createGroup.textContent).toContain('Novo Artigo');
        expect(createGroup.textContent).toContain('Novo Produto');
        expect(createGroup.textContent).toContain('Nova Categoria');
        expect(createGroup.textContent).toContain('Novo Autor');
      },
    );

    it('busca "produto" casa com item de navegação e de criação — ambos os grupos aparecem (EDITOR)', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', false, 'EDITOR'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'produto');

      expect(screen.getByRole('group', { name: 'Navegar' }).textContent).toContain('Produtos');
      expect(screen.getByRole('group', { name: 'Criar' }).textContent).toContain('Novo Produto');
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('busca "novo" só casa com ações de criação — grupo "Navegar" some, "Criar" permanece (OWNER)', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', false, 'OWNER'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'novo');

      expect(screen.queryByRole('group', { name: 'Navegar' })).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Criar' })).toBeInTheDocument();
    });

    it('VIEWER + busca "novo produto": nenhum resultado, sem grupo "Criar" vazio', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', false, 'VIEWER'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'novo produto');

      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Nenhum resultado encontrado');
    });

    it('ArrowDown atravessa a fronteira entre grupos: do último item de "Navegar" para o primeiro de "Criar" (EDITOR)', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', false, 'EDITOR'));
      act(() => pressShortcut());

      const input = screen.getByRole('combobox', { name: 'Buscar navegação' });
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}'); // Artigos -> Produtos -> Categorias -> Autores
      const autores = screen.getByRole('option', { name: 'Autores' });
      expect(input).toHaveAttribute('aria-activedescendant', autores.id);

      await user.keyboard('{ArrowDown}'); // atravessa a fronteira para o primeiro item de "Criar"
      const novoArtigo = screen.getByRole('option', { name: 'Novo Artigo' });
      expect(input).toHaveAttribute('aria-activedescendant', novoArtigo.id);
    });

    it('Enter numa ação de criação navega para a rota /new correspondente (sem alteração pendente, EDITOR)', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', false, 'EDITOR'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'Novo Produto');
      await user.keyboard('{Enter}');

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products/new'));
    });

    it('com alterações não salvas, Enter numa ação de criação + "Ficar" mantém a paleta aberta e não navega (OWNER)', async () => {
      const user = userEvent.setup();
      render(buildTree('/fastcompre/categories', true, 'OWNER'));
      act(() => pressShortcut());

      await user.type(screen.getByRole('combobox', { name: 'Buscar navegação' }), 'Novo Produto');
      await user.keyboard('{Enter}');

      const stayButton = await screen.findByRole('button', { name: 'Ficar' });
      await user.click(stayButton);

      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();
    });

    it('jest-axe: nenhuma violação com os dois grupos renderizados (EDITOR)', async () => {
      const { container } = render(buildTree('/fastcompre/categories', false, 'EDITOR'));
      act(() => pressShortcut());

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
