import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ToastProvider } from '../../toast-context';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';
import { CreateCategory } from './create-category';

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
 * `UnsavedChangesProvider` (UXA-003) — `CategoryForm`, usado internamente
 * por `CreateCategory`, publica `isDirty` via `useSyncFormDirty`, que
 * exige o Provider como ancestral.
 *
 * `ToastProvider` (UXA-004) — `CreateCategory` agora chama `useToast()`
 * diretamente, o que exige o Provider como ancestral aqui também.
 */
function renderCreateCategory() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <CreateCategory siteSlug="fastcompre" />
        </ToastProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

describe('CreateCategory', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('submit válido: chama POST e redireciona para /:siteSlug/categories/:id com o id retornado', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: '11111111-1111-4111-8111-111111111111',
        siteId: '22222222-2222-4222-8222-222222222222',
        name: 'Eletrônicos',
        slug: 'eletronicos',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderCreateCategory();

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/categories/11111111-1111-4111-8111-111111111111'),
    );
  });

  it('erro de negócio (409, slug em conflito): mostra a mensagem da API, sem navegar', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Já existe uma categoria com este slug neste Site.',
      }),
    );

    renderCreateCategory();

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Já existe uma categoria com este slug neste Site.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- UXA-004: toast de sucesso ---

  it('UXA-004: submit válido dispara o toast "Categoria salva." e mantém o redirect existente', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: '11111111-1111-4111-8111-111111111111',
        siteId: '22222222-2222-4222-8222-222222222222',
        name: 'Eletrônicos',
        slug: 'eletronicos',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderCreateCategory();

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Categoria salva.');
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/categories/11111111-1111-4111-8111-111111111111'),
    );
  });

  it('UXA-004: erro de negócio (409) não dispara o toast', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Já existe uma categoria com este slug neste Site.',
      }),
    );

    renderCreateCategory();

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Já existe uma categoria com este slug neste Site.');
    expect(screen.queryByText('Categoria salva.')).not.toBeInTheDocument();
  });

  it('UXA-004: o toast sobrevive à troca de rota — o Provider persiste acima do formulário desmontado', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: '11111111-1111-4111-8111-111111111111',
        siteId: '22222222-2222-4222-8222-222222222222',
        name: 'Eletrônicos',
        slug: 'eletronicos',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    const { rerender } = render(
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <ToastProvider>
            <CreateCategory siteSlug="fastcompre" />
          </ToastProvider>
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>,
    );

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Categoria salva.');

    // Simula o que `router.replace` provoca na aplicação real: o conteúdo
    // roteado (o formulário de criação) é substituído pela tela de
    // destino, mas o layout — e, com ele, `ToastProvider` — nunca
    // desmonta. `rerender` com o mesmo `ToastProvider` na mesma posição da
    // árvore preserva sua instância/estado (reconciliação padrão do
    // React), o que é exatamente o que acontece de verdade quando o
    // Next.js troca só `children` do layout numa navegação dentro do
    // mesmo `[siteSlug]`.
    rerender(
      <AppRouterContext.Provider value={mockRouter}>
        <UnsavedChangesProvider>
          <ToastProvider>
            <p>Categoria detail placeholder</p>
          </ToastProvider>
        </UnsavedChangesProvider>
      </AppRouterContext.Provider>,
    );

    expect(screen.getByText('Categoria salva.')).toBeInTheDocument();
  });

  it('UXA-005: sem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderCreateCategory();

    expect(await axe(container)).toHaveNoViolations();
  });
});
