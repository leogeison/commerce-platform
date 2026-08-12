import type { ContextType } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Home } from './home';

/**
 * `NEXT_PUBLIC_API_URL` já vem fixado por `jest.setup.ts`. Este arquivo
 * mocka `global.fetch` diretamente, exercitando a integração real entre
 * `Home` e `apiRequest` (ADM-001).
 *
 * `useRouter()` não é mockado via `jest.mock('next/navigation', ...)` —
 * confirmado na ADM-002 que o transform SWC "server components aware" do
 * `next/jest` não intercepta esse import quando feito de dentro de um
 * componente. `AppRouterContext.Provider` real fornece o contexto que
 * `useRouter()` lê internamente, sem depender desse detalhe de transform.
 */
const mockReplace = jest.fn();

const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function renderHome() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <Home />
    </AppRouterContext.Provider>,
  );
}

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

const meResponseWithOneSite = {
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@fastcompre.com', name: 'Ana' },
  sites: [
    {
      siteId: '22222222-2222-4222-8222-222222222222',
      siteSlug: 'fastcompre',
      siteName: 'FastCompre',
      role: 'OWNER',
    },
  ],
};

const meResponseWithNoSites = {
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@fastcompre.com', name: 'Ana' },
  sites: [],
};

const meResponseWithManySites = {
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

describe('Home', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..." enquanto /admin/auth/me está pendente', () => {
    const pending = new Promise<Response>(() => {
      // nunca resolve durante o teste — mantém o estado de loading estável
      // para a assertion, sem depender de timing.
    });
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(pending);

    renderHome();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('401: redireciona para /login, sem mostrar mensagem de erro', async () => {
    mockFetchOnce(401, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      message: 'Não autenticado.',
    });

    renderHome();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro inesperado (500, corpo fora do formato): mostra mensagem genérica, não redireciona', async () => {
    mockFetchOnce(500, { unexpected: 'shape' });

    renderHome();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar seus Sites. Tente novamente em instantes.');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('zero Sites: mostra mensagem de sem acesso, não redireciona', async () => {
    mockFetchOnce(200, meResponseWithNoSites);

    renderHome();

    expect(await screen.findByText('Você não tem acesso a nenhum Site.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('exatamente um Site: redireciona para /:siteSlug/categories, sem renderizar lista', async () => {
    mockFetchOnce(200, meResponseWithOneSite);

    renderHome();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/fastcompre/categories'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('múltiplos Sites: renderiza um link por Site com destino /:siteSlug/categories', async () => {
    mockFetchOnce(200, meResponseWithManySites);

    renderHome();

    const fastcompreLink = await screen.findByRole('link', { name: 'FastCompre' });
    expect(fastcompreLink).toHaveAttribute('href', '/fastcompre/categories');

    const outraMarcaLink = screen.getByRole('link', { name: 'Outra Marca' });
    expect(outraMarcaLink).toHaveAttribute('href', '/outra-marca/categories');

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
