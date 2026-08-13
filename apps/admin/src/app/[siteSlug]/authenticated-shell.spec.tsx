import type { ContextType } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AuthenticatedShell } from './authenticated-shell';
import { useSiteRole } from './site-role-context';

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

function RoleProbe() {
  const role = useSiteRole();
  return <p>Role via Context: {role}</p>;
}

function renderShell(pathname: string, children: React.ReactNode = <p>Conteúdo da página</p>) {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <PathnameContext.Provider value={pathname}>
        <AuthenticatedShell siteSlug="fastcompre">{children}</AuthenticatedShell>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
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
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/site-sem-acesso/categories">
          <AuthenticatedShell siteSlug="site-sem-acesso">
            <p>Conteúdo</p>
          </AuthenticatedShell>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
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

  it('fornece a Role do Site atual via SiteRoleProvider (ADM-012), sem prop drilling', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    renderShell('/fastcompre/categories', <RoleProbe />);

    expect(await screen.findByText('Role via Context: OWNER')).toBeInTheDocument();
  });

  it('troca de siteSlug (prop) atualiza a Role fornecida pelo Context, sem esperar novo fetch', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, meResponse));

    const { rerender } = render(
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/fastcompre/categories">
          <AuthenticatedShell siteSlug="fastcompre">
            <RoleProbe />
          </AuthenticatedShell>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );

    expect(await screen.findByText('Role via Context: OWNER')).toBeInTheDocument();

    rerender(
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/outra-marca/categories">
          <AuthenticatedShell siteSlug="outra-marca">
            <RoleProbe />
          </AuthenticatedShell>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
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

  it('logout: sucesso chama POST /admin/auth/logout e redireciona para /login', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return emptyResponse(204);
      }
      return jsonResponse(200, meResponse);
    });

    renderShell('/fastcompre/categories');

    const logoutButton = await screen.findByRole('button', { name: 'Sair' });
    await user.click(logoutButton);

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

    const logoutButton = await screen.findByRole('button', { name: 'Sair' });
    await user.click(logoutButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível sair. Tente novamente em instantes.');
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
    expect(logoutButton).not.toBeDisabled();
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

    const logoutButton = await screen.findByRole('button', { name: 'Sair' });
    await user.click(logoutButton);
    expect(await screen.findByRole('button', { name: 'Saindo...' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Saindo...' }));

    resolveLogout(emptyResponse(204));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));

    expect(logoutCallCount).toBe(1);
  });
});
