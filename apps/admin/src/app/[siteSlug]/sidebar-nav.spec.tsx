import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
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
 * `PathnameContext` (`usePathname()`, agora próprio de `SidebarNav`).
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

function renderSidebarNav(pathname: string, isDirty = false) {
  return render(
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>
          <UnsavedChangesProvider>
            <DirtyPublisher isDirty={isDirty} />
            <SidebarNav siteSlug="fastcompre" />
          </UnsavedChangesProvider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>,
  );
}

describe('SidebarNav', () => {
  afterEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('renderiza os 4 itens (Artigos, Produtos, Categorias, Autores) com o href correto — sem Dashboard', () => {
    renderSidebarNav('/fastcompre/categories');

    expect(screen.getByRole('link', { name: 'Artigos' })).toHaveAttribute('href', '/fastcompre/articles');
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/fastcompre/products');
    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('href', '/fastcompre/categories');
    expect(screen.getByRole('link', { name: 'Autores' })).toHaveAttribute('href', '/fastcompre/authors');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
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
  });

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

  it('sem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderSidebarNav('/fastcompre/categories');

    expect(await axe(container)).toHaveNoViolations();
  });
});
