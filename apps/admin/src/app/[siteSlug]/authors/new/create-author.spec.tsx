import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { CreateAuthor } from './create-author';
import { ToastProvider } from '../../toast-context';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';

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
 * `UnsavedChangesProvider`/`ToastProvider` (UXA-015) — `AuthorForm` (via
 * `CreateAuthor`) agora chama `useSyncFormDirty()` e `CreateAuthor` chama
 * `useToast()` incondicionalmente; ambos exigem seus Providers como
 * ancestrais, mesmo critério já usado em `create-product.spec.tsx`.
 */
function renderCreateAuthor() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <CreateAuthor siteSlug="fastcompre" />
        </ToastProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

describe('CreateAuthor', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('submit válido: omite bio/avatarUrl vazios e NUNCA inclui userId no POST; redireciona com o id retornado', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: '11111111-1111-4111-8111-111111111111',
        siteId: '22222222-2222-4222-8222-222222222222',
        userId: null,
        name: 'Ana Souza',
        bio: null,
        avatarUrl: null,
      }),
    );
    global.fetch = fetchMock;

    renderCreateAuthor();

    await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Autor salvo.')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/fastcompre/authors/11111111-1111-4111-8111-111111111111'),
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const capturedBody = postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
    expect(capturedBody).toEqual({ name: 'Ana Souza' });
    expect(capturedBody).not.toHaveProperty('userId');
    expect(capturedBody).not.toHaveProperty('bio');
    expect(capturedBody).not.toHaveProperty('avatarUrl');
  });

  it('erro de negócio (422, userId inválido — cenário defensivo da API): mostra a mensagem da API, sem navegar', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(422, {
        statusCode: 422,
        code: 'UNPROCESSABLE_ENTITY',
        error: 'Unprocessable Entity',
        message: 'userId inválido: o usuário não existe.',
      }),
    );

    renderCreateAuthor();

    await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('userId inválido: o usuário não existe.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
