import type { ContextType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AuthenticatedShell } from './authenticated-shell';
import { CategoryForm } from './categories/category-form';
import { useSiteRole } from './site-role-context';
import { UnsavedChangesProvider } from './unsaved-changes-context';

/**
 * `NEXT_PUBLIC_API_URL` já vem fixado por `jest.setup.ts`. `global.fetch` é
 * mockado diretamente por URL/método, já que este componente chama dois
 * endpoints diferentes (`GET /admin/auth/me`, `POST /admin/auth/logout`).
 *
 * `useRouter()`/`usePathname()` não são mockados via `jest.mock('next/navigation', ...)`
 * — confirmado na ADM-002/003 que o transform SWC "server components aware"
 * do `next/jest` não intercepta esse import quando feito de dentro de um
 * componente. `AppRouterContext.Provider`/`PathnameContext.Provider` reais
 * fornecem os contextos que esses hooks leem internamente.
 *
 * `UnsavedChangesProvider` (UXA-003) envolve `AuthenticatedShell` em todo
 * teste — em produção isso é feito por `layout.tsx`; aqui,
 * `AuthenticatedShell` consome `useUnsavedChangesGuard()` diretamente
 * (troca de Site, Logout, `GuardedLink` na navegação).
 */
const mockReplace = jest.fn();
const mockPush = jest.fn();

const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: mockPush,
  replace: mockReplace,
  prefetch: jest.fn(),
};

/**
 * `next/link` (usado por `GuardedLink`) lê internamente o `RouterContext`
 * legado antes de decidir se intercepta o clique — ver comentário
 * equivalente em `guarded-link.spec.tsx`. Sem este Provider, `onNavigate`
 * nunca é chamado e a navegação por clique nunca é exercida nos testes.
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

function RoleProbe() {
  const role = useSiteRole();
  return <p>Role via Context: {role}</p>;
}

function renderShell(pathname: string, children: ReactNode = <p>Conteúdo da página</p>) {
  return render(
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
      <PathnameContext.Provider value={pathname}>
        <UnsavedChangesProvider>
          <AuthenticatedShell siteSlug="fastcompre">{children}</AuthenticatedShell>
        </UnsavedChangesProvider>
      </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>,
  );
}

const meResponse = {
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@fastcompre.com', name: 'Ana' },
  sites: [
    {
      siteId: '22222222-2222-4222-8222-222222222222',
      siteSlug: 'fastcompre',
      siteName: 'FastCompre',
      role: 'OWNER',
    },
    {
      siteId: '33333333-3333-4333-8333-333333333333',
      siteSlug: 'outra-marca',
      siteName: 'Outra Marca',
      role: 'EDITOR',
    },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(''),
  } as Response;
}

describe('AuthenticatedShell', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..." enquanto /admin/auth/me está pendente', () => {
    const pending = new Promise<Response>(() => {
      // nunca resolve durante o teste.
    });
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(pending);

    renderShell('/fastcompre/categories');

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('401 em /admin/auth/me: redireciona para /login', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(401, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized',
        message: 'Não autenticado.',
      }),
    );

    renderShell('/fastcompre/categories');

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('erro inesperado em /admin/auth/me: mostra mensagem genérica, sem navegação', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' }));

    renderShell('/fastcompre/categories');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar este Site. Tente novamente em instantes.');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('siteSlug fora dos Sites permitidos: redireciona para /', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    render(
      <RouterContext.Provider value={mockLegacyRouter as never}>
        <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/site-sem-acesso/categories">
          <UnsavedChangesProvider>
            <AuthenticatedShell siteSlug="site-sem-acesso">
              <p>Conteúdo</p>
            </AuthenticatedShell>
          </UnsavedChangesProvider>
        </PathnameContext.Provider>
        </AppRouterContext.Provider>
      </RouterContext.Provider>,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('siteSlug válido: renderiza os 4 links de navegação e o seletor de Site com nome acessível', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');

    expect(await screen.findByRole('link', { name: 'Categorias' })).toHaveAttribute(
      'href',
      '/fastcompre/categories',
    );
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/fastcompre/products');
    expect(screen.getByRole('link', { name: 'Autores' })).toHaveAttribute('href', '/fastcompre/authors');
    expect(screen.getByRole('link', { name: 'Artigos' })).toHaveAttribute('href', '/fastcompre/articles');

    const select = screen.getByRole('combobox', { name: 'Site' });
    expect(select).toHaveValue('fastcompre');

    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  // --- UXA-019C: `user` (MeResponse.user) repassado a Topbar ---

  it('UXA-019C: repassa `MeResponse.user` para a Topbar — o gatilho da User Pill (avatar-only) recebe o nome acessível dinâmico vindo do fetch existente', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');

    // `meResponse.user.name` é "Ana" — a User Pill é avatar-only (sem nome
    // visível em nenhuma largura), então a prova de que `user` chegou de
    // fato à Topbar é o nome acessível do gatilho, não um texto visível.
    expect(await screen.findByRole('button', { name: 'Menu do usuário, Ana' })).toBeInTheDocument();
  });

  it('fornece a Role do Site atual via SiteRoleProvider (ADM-012), sem prop drilling', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories', <RoleProbe />);

    expect(await screen.findByText('Role via Context: OWNER')).toBeInTheDocument();
  });

  it('troca de siteSlug (prop) atualiza a Role fornecida pelo Context, sem esperar novo fetch', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    const { rerender } = render(
      <RouterContext.Provider value={mockLegacyRouter as never}>
        <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/fastcompre/categories">
          <UnsavedChangesProvider>
            <AuthenticatedShell siteSlug="fastcompre">
              <RoleProbe />
            </AuthenticatedShell>
          </UnsavedChangesProvider>
        </PathnameContext.Provider>
        </AppRouterContext.Provider>
      </RouterContext.Provider>,
    );

    expect(await screen.findByText('Role via Context: OWNER')).toBeInTheDocument();

    rerender(
      <RouterContext.Provider value={mockLegacyRouter as never}>
        <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/outra-marca/categories">
          <UnsavedChangesProvider>
            <AuthenticatedShell siteSlug="outra-marca">
              <RoleProbe />
            </AuthenticatedShell>
          </UnsavedChangesProvider>
        </PathnameContext.Provider>
        </AppRouterContext.Provider>
      </RouterContext.Provider>,
    );

    expect(await screen.findByText('Role via Context: EDITOR')).toBeInTheDocument();
  });

  it('link ativo recebe aria-current="page"', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');

    const categoriasLink = await screen.findByRole('link', { name: 'Categorias' });
    expect(categoriasLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Produtos' })).not.toHaveAttribute('aria-current');
  });

  it('troca de Site no seletor: navega via router.push para /:siteSlug/categories do novo Site', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');

    const select = await screen.findByRole('combobox', { name: 'Site' });
    await user.selectOptions(select, 'Outra Marca');

    expect(mockPush).toHaveBeenCalledWith('/outra-marca/categories');
  });

  /**
   * UXA-007 — "Sair" deixou de ser um botão solto na topbar e passou a
   * ser item do menu de usuário (`aria-haspopup="menu"`/`role="menu"` em
   * `Topbar`). Os quatro testes de logout abaixo abrem o menu antes de
   * agir — nenhuma asserção downstream foi removida ou enfraquecida, só o
   * caminho até o botão mudou. `role="menuitem"` (não `role="button"`)
   * porque o elemento sobrescreve seu papel implícito via `role`.
   */
  async function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /^Menu do usuário/ }));
  }

  it('logout: sucesso chama POST /admin/auth/logout e redireciona para /login', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return emptyResponse(204);
      }
      return jsonResponse(200, meResponse);
    });

    renderShell('/fastcompre/categories');
    await openUserMenu(user);

    const logoutItem = await screen.findByRole('menuitem', { name: 'Sair' });
    await user.click(logoutItem);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('logout: falha mostra mensagem genérica, sem redirect, botão reabilitado', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(500, { unexpected: 'shape' });
      }
      return jsonResponse(200, meResponse);
    });

    renderShell('/fastcompre/categories');
    await openUserMenu(user);

    const logoutItem = await screen.findByRole('menuitem', { name: 'Sair' });
    await user.click(logoutItem);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível sair. Tente novamente em instantes.');
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
    expect(logoutItem).not.toBeDisabled();
    // Falha preserva o menu aberto (não fecha automaticamente ao ativar
    // "Sair") — o alerta precisa continuar visível para nova tentativa.
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('logout: não dispara segunda chamada enquanto a primeira ainda está pendente', async () => {
    const user = userEvent.setup();
    let resolveLogout!: (response: Response) => void;
    const pendingLogout = new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    });
    let logoutCallCount = 0;
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        logoutCallCount += 1;
        return pendingLogout;
      }
      return jsonResponse(200, meResponse);
    });

    renderShell('/fastcompre/categories');
    await openUserMenu(user);

    const logoutItem = await screen.findByRole('menuitem', { name: 'Sair' });
    await user.click(logoutItem);
    expect(await screen.findByRole('menuitem', { name: 'Saindo...' })).toBeDisabled();

    await user.click(screen.getByRole('menuitem', { name: 'Saindo...' }));

    resolveLogout(emptyResponse(204));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));

    expect(logoutCallCount).toBe(1);
  });

  // --- UXA-003: dirty-state guard ---

  /**
   * `children` de `renderShell` é um `CategoryForm` real (não um dublê) —
   * é a única forma de deixar `isDirty` verdadeiramente `true` via
   * `formState.isDirty` da RHF, a mesma autoridade que o guard publica.
   */
  function dirtyCategoryFormChildren() {
    return (
      <CategoryForm
        initialValues={{ name: '', slug: '' }}
        submitLabel="Salvar"
        onSubmit={jest.fn<(values: { name: string; slug: string }) => Promise<void>>().mockResolvedValue(undefined)}
      />
    );
  }

  async function renderShellWithDirtyForm() {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));
    const user = userEvent.setup();

    renderShell('/fastcompre/categories', dirtyCategoryFormChildren());

    await user.type(await screen.findByLabelText('Nome'), 'Eletrônicos');

    return user;
  }

  it('UXA-003: sem alteração no formulário, clicar num link de navegação não abre confirmação', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories', dirtyCategoryFormChildren());

    await user.click(await screen.findByRole('link', { name: 'Produtos' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Sem estado sujo, quem navega é o próprio `next/link` (via
    // `RouterContext`), que inclui um segundo argumento de opções interno
    // do Next — por isso `expect.anything()` no lugar de um valor exato.
    expect(mockPush).toHaveBeenCalledWith('/fastcompre/products', expect.anything());
  });

  it('UXA-003: link de navegação com formulário sujo abre confirmação; Cancelar mantém na página', async () => {
    const user = await renderShellWithDirtyForm();

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalledWith('/fastcompre/products');
    expect(screen.getByLabelText('Nome')).toHaveValue('Eletrônicos');
  });

  it('UXA-003: link de navegação com formulário sujo abre confirmação; Sair sem salvar navega', async () => {
    const user = await renderShellWithDirtyForm();

    await user.click(screen.getByRole('link', { name: 'Produtos' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fastcompre/products'));
  });

  it('UXA-003: troca de Site com formulário sujo pede confirmação antes de navegar', async () => {
    const user = await renderShellWithDirtyForm();

    const select = screen.getByRole('combobox', { name: 'Site' });
    await user.selectOptions(select, 'Outra Marca');

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(mockPush).not.toHaveBeenCalledWith('/outra-marca/categories');

    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/outra-marca/categories'));
  });

  it('UXA-003: logout com formulário sujo pede confirmação antes de deslogar', async () => {
    const user = await renderShellWithDirtyForm();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return emptyResponse(204);
      }
      return jsonResponse(200, meResponse);
    });

    await openUserMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }));

    await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(mockReplace).not.toHaveBeenCalledWith('/login');

    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  // --- UXA-009: política de concorrência modal da Command Palette ---

  it('UXA-009: atalho global (Ctrl+K) não abre a Command Palette com o drawer da UXA-008 aberto', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');

    await user.click(await screen.findByRole('button', { name: 'Menu' }));
    expect(await screen.findByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });

    expect(screen.queryByRole('combobox', { name: 'Buscar navegação' })).not.toBeInTheDocument();
    // o drawer continua aberto — a paleta não assumiu o comando por cima dele.
    expect(screen.getByRole('dialog', { name: 'Menu de navegação' })).toBeInTheDocument();
  });

  it('UXA-009: atalho global (Ctrl+K) não abre a Command Palette com a confirmação de alterações não salvas aberta', async () => {
    const user = await renderShellWithDirtyForm();

    await user.click(screen.getByRole('link', { name: 'Produtos' }));
    await screen.findByRole('dialog', { name: 'Alterações não salvas' });

    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });

    expect(screen.queryByRole('combobox', { name: 'Buscar navegação' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Alterações não salvas' })).toBeInTheDocument();
  });

  it('UXA-009: sem nenhum outro modal aberto, o atalho global abre a Command Palette normalmente', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories');
    await screen.findByRole('link', { name: 'Categorias' });

    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });

    expect(screen.getByRole('combobox', { name: 'Buscar navegação' })).toBeInTheDocument();
  });

  // --- UXA-011: skip link, landmarks e foco do shell ---

  describe('UXA-011 — skip link e landmarks', () => {
    it('skip link é o primeiro elemento focável do shell — ordem de Tab segue a ordem do DOM', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      // `userEvent.tab()` depende do algoritmo de "próximo tabbable" da
      // biblioteca, que este projeto já evita para testes de ordem de Tab
      // (`command-palette.spec.tsx` usa `fireEvent` com `KeyboardEvent`
      // manual pelo mesmo motivo) — em vez disso, testamos diretamente o
      // que determina a ordem real: nenhum elemento do shell usa
      // `tabIndex` positivo, então a ordem de Tab É a ordem do DOM.
      // `[tabindex="0"]` fica de fora do seletor de propósito — cobriria o
      // próprio link (que não declara `tabIndex` nenhum, foco nativo de
      // `<a href>`) sem risco de também capturar `<main tabIndex={-1}>`.
      const { container } = renderShell('/fastcompre/categories');
      await screen.findByRole('link', { name: 'Categorias' });

      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select, input, textarea, [tabindex="0"]',
      );

      expect(focusable[0]).toBe(screen.getByRole('link', { name: 'Pular para o conteúdo principal' }));
    });

    it('skip link fica fora do fluxo (position fixed) e oculto por padrão, com a variante de foco cabeada nas classes', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      renderShell('/fastcompre/categories');

      const skipLink = await screen.findByRole('link', { name: 'Pular para o conteúdo principal' });
      // Oculto por padrão via translateY(-100%) — proporcional à própria altura
      // do elemento, não uma distância fixa (ver doc comment de
      // SKIP_LINK_CLASSES). `fixed` garante que nunca participa do fluxo do
      // `.shell`/`<header>`, nos dois estados — é isso que evita layout shift
      // ao focar (verificado visualmente em Chromium real, jsdom não computa
      // layout).
      const classes = skipLink.className.split(/\s+/);
      expect(classes).toContain('fixed');
      expect(classes).toContain('-translate-y-full');
      // Variante de foco: substitui o translateY por um valor proporcional ao
      // token de espaçamento (`space-4`), não reintroduz o elemento no fluxo
      // — e só essa forma prefixada existe (nenhum `translate-y-4` "solto").
      expect(classes).toContain('focus:translate-y-4');
      expect(classes).not.toContain('translate-y-4');
    });

    it('ativar o skip link (clique/Enter) move o foco para o <main>, sem preventDefault (href nativo preservado)', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      renderShell('/fastcompre/categories');

      const skipLink = await screen.findByRole('link', { name: 'Pular para o conteúdo principal' });
      expect(skipLink).toHaveAttribute('href', '#main-content');

      fireEvent.click(skipLink);

      expect(screen.getByRole('main')).toHaveFocus();
    });

    it('<main> possui id="main-content" e tabIndex={-1}', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      renderShell('/fastcompre/categories');

      const main = await screen.findByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
      expect(main).toHaveAttribute('tabindex', '-1');
    });

    it('skip link não existe nos estados loading/error (não há <main> para apontar)', async () => {
      const pending = new Promise<Response>(() => {
        // nunca resolve durante o teste.
      });
      global.fetch = jest.fn<typeof fetch>().mockReturnValue(pending);

      renderShell('/fastcompre/categories');

      expect(screen.getByText('Carregando...')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Pular para o conteúdo principal' })).not.toBeInTheDocument();
    });

    it('jest-axe: nenhuma violação no shell completo (drawer fechado, palette fechada)', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      const { container } = renderShell('/fastcompre/categories');
      await screen.findByRole('link', { name: 'Categorias' });

      expect(await axe(container)).toHaveNoViolations();
    });

    it('jest-axe: nenhuma violação no shell completo com o drawer mobile (UXA-008) aberto', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

      const { container } = renderShell('/fastcompre/categories');
      await user.click(await screen.findByRole('button', { name: 'Menu' }));
      await screen.findByRole('dialog', { name: 'Menu de navegação' });

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
