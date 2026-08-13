import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
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

function renderCreateProduct() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <CreateProduct siteSlug="fastcompre" />
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

describe('CreateProduct', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('submit válido: chama POST omitindo campos opcionais vazios e redireciona para /:siteSlug/products/:id', async () => {
    const user = userEvent.setup();
    mockFetch(() => {
      return jsonResponse(201, {
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
      });
    });
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
});
