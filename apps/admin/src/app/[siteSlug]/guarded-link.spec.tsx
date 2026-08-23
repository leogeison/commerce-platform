import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { GuardedLink } from './guarded-link';
import { UnsavedChangesProvider, useSyncFormDirty } from './unsaved-changes-context';

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

/**
 * `next/link` (a implementação real, única, tanto para Pages quanto para
 * App Router) ainda lê o `RouterContext` legado internamente para decidir
 * se intercepta o clique (`onClick` do próprio Link faz `if (!router)
 * return` antes mesmo de chamar `onNavigate`). Em produção, o runtime do
 * App Router (`next/dist/client/components/app-router.js`) monta esse
 * Provider automaticamente por compatibilidade — nos testes precisamos
 * fornecê-lo manualmente, do mesmo jeito que já fornecemos
 * `AppRouterContext.Provider` para `useRouter()`. `push`/`replace` reusam
 * os mesmos mocks para que a asserção funcione independente de qual
 * contexto o Link decidir usar internamente. A ausência da chave
 * `beforePopState` é proposital: sinaliza para `next/link` que este é um
 * router de App Router (assinatura `push(href, options)`), não o router
 * legado do Pages Router.
 */
const mockLegacyRouter = {
  pathname: '/fastcompre/categories',
  asPath: '/fastcompre/categories',
  push: mockPush,
  replace: mockReplace,
  // `next/link` chama `router.prefetch(...).catch(...)` no `onMouseEnter`
  // (o `userEvent.click` do Testing Library simula um hover antes do
  // clique) — precisa resolver uma Promise, não só existir, senão o
  // `.catch()` interno do próprio `next/link` falha com
  // "Cannot read properties of undefined (reading 'catch')".
  prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

function DirtyPublisher({ isDirty }: { isDirty: boolean }) {
  useSyncFormDirty(isDirty);
  return null;
}

function renderGuardedLink(isDirty: boolean, props: Partial<React.ComponentProps<typeof GuardedLink>> = {}) {
  return render(
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <DirtyPublisher isDirty={isDirty} />
          <GuardedLink href="/fastcompre/products" {...props}>
            Produtos
          </GuardedLink>
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>,
  );
}

describe('GuardedLink', () => {
  afterEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('sem alterações não salvas: comporta-se como um Link comum, sem diálogo', async () => {
    const user = userEvent.setup();
    renderGuardedLink(false);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Sem estado sujo, `GuardedLink` não intercepta — quem navega é o
    // próprio `next/link`, que chama `router.push(href, options)` (o
    // segundo argumento é interno do Next, por isso `expect.anything()`).
    expect(mockPush).toHaveBeenCalledWith('/fastcompre/products', expect.anything());
  });

  it('com alterações não salvas: intercepta a navegação e abre a confirmação', async () => {
    const user = userEvent.setup();
    renderGuardedLink(true);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('confirmar a saída completa a navegação interrompida', async () => {
    const user = userEvent.setup();
    renderGuardedLink(true);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products'));
  });

  it('cancelar a saída nunca navega', async () => {
    const user = userEvent.setup();
    renderGuardedLink(true);

    await user.click(screen.getByRole('link', { name: 'Produtos' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('prop replace: confirmar a saída usa router.replace, não router.push', async () => {
    const user = userEvent.setup();
    renderGuardedLink(true, { replace: true });

    await user.click(screen.getByRole('link', { name: 'Produtos' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/fastcompre/products'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('repassa props extras (ex.: aria-current) para o <a> renderizado', () => {
    renderGuardedLink(false, { 'aria-current': 'page' });

    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('aria-current', 'page');
  });
});
