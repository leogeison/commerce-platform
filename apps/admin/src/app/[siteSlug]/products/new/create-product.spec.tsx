import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ToastProvider } from '../../toast-context';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';
import { CreateProduct } from './create-product';

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

/**
 * `UnsavedChangesProvider` (UXA-003) — `ProductForm`, usado internamente por
 * `CreateProduct`, publica `isDirty` via `useSyncFormDirty`, que exige o
 * Provider como ancestral.
 *
 * `ToastProvider` (UXA-004) — `CreateProduct` agora chama `useToast()`
 * diretamente, o que exige o Provider como ancestral aqui também. Mesmo par
 * de Providers já usado em `create-category.spec.tsx`.
 */
function renderCreateProduct() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <CreateProduct siteSlug="fastcompre" />
        </ToastProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

function mockFetch(createResponse: () => Response) {
  global.fetch = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    }
    if (init?.method === 'POST') {
      return createResponse();
    }
    return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
  });
}

const CREATED_PRODUCT = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  name: 'Fone Bluetooth',
  slug: 'fone-bluetooth',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CreateProduct', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('submit válido: chama POST omitindo campos opcionais vazios e redireciona para /:siteSlug/products/:id', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, CREATED_PRODUCT));
    const fetchMock = global.fetch as jest.Mock<typeof fetch>;

    renderCreateProduct();

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/products/11111111-1111-4111-8111-111111111111'),
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const capturedBody = postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
    expect(capturedBody).toEqual({ name: 'Fone Bluetooth', slug: 'fone-bluetooth' });
  });

  it('erro de negócio (409, slug em conflito): mostra a mensagem da API, sem navegar', async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Já existe um produto com este slug neste Site.',
      }),
    );

    renderCreateProduct();

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Já existe um produto com este slug neste Site.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- UXA-004: toast de sucesso (replicado integralmente para Produto — criação e edição) ---

  it('UXA-004: submit válido dispara o toast "Produto salvo." e mantém o redirect existente', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, CREATED_PRODUCT));

    renderCreateProduct();

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Produto salvo.');
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/products/11111111-1111-4111-8111-111111111111'),
    );
  });

  it('UXA-004: erro de negócio (409) não dispara o toast', async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Já existe um produto com este slug neste Site.',
      }),
    );

    renderCreateProduct();

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Já existe um produto com este slug neste Site.');
    expect(screen.queryByText('Produto salvo.')).not.toBeInTheDocument();
  });

  it('UXA-004: o toast sobrevive à troca de rota — o Provider persiste acima do formulário desmontado', async () => {
    const user = userEvent.setup();
    mockFetch(() => jsonResponse(201, CREATED_PRODUCT));

    const { rerender } = render(
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <ToastProvider>
            <CreateProduct siteSlug="fastcompre" />
          </ToastProvider>
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>,
    );

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Produto salvo.');

    // Simula o que `router.replace` provoca na aplicação real: o conteúdo
    // roteado (o formulário de criação) é substituído pela tela de destino,
    // mas o layout — e, com ele, `ToastProvider` — nunca desmonta. `rerender`
    // com o mesmo `ToastProvider` na mesma posição da árvore preserva sua
    // instância/estado (reconciliação padrão do React), exatamente o que
    // acontece de verdade quando o Next.js troca só `children` do layout
    // numa navegação dentro do mesmo `[siteSlug]`.
    rerender(
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <ToastProvider>
            <p>Produto detail placeholder</p>
          </ToastProvider>
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>,
    );

    expect(screen.getByText('Produto salvo.')).toBeInTheDocument();
  });

  it('UXA-013: sem violação de acessibilidade (jest-axe)', async () => {
    mockFetch(() => jsonResponse(201, CREATED_PRODUCT));
    const { container } = renderCreateProduct();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument());

    expect(await axe(container)).toHaveNoViolations();
  });
});
