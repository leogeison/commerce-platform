import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { AuthorDetail } from './author-detail';

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function renderDetail() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <AuthorDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
    </AppRouterContext.Provider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve('') } as Response;
}

const baseAuthor = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  name: 'Ana Souza',
  bio: 'Editora-chefe',
  avatarUrl: 'https://cdn.example.com/ana.jpg',
};

describe('AuthorDetail', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDetail();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('404: mostra a mensagem vinda da API', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(404, {
        statusCode: 404,
        code: 'NOT_FOUND',
        error: 'Not Found',
        message: 'Autor não encontrado.',
      }),
    );
    renderDetail();

    expect(await screen.findByText('Autor não encontrado.')).toBeInTheDocument();
  });

  it('sucesso: preenche o formulário, sem nenhum botão de arquivar/desarquivar', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseAuthor));
    renderDetail();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('Bio')).toHaveValue('Editora-chefe');
    expect(screen.getByRole('img', { name: 'Avatar do Autor' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/ana.jpg',
    );
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('editar (só name/bio/avatarUrl) com sucesso: atualiza o estado local, permanece na página, e o PATCH não contém a propriedade userId', async () => {
    const user = userEvent.setup();
    let capturedPatchBody: unknown;
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'PATCH') {
        capturedPatchBody = JSON.parse(String(init.body));
        return jsonResponse(200, { ...baseAuthor, name: 'Ana Souza Lima' });
      }
      return jsonResponse(200, baseAuthor);
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ana Souza Lima');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Ana Souza Lima'));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(capturedPatchBody).toEqual({
      name: 'Ana Souza Lima',
      bio: 'Editora-chefe',
      avatarUrl: 'https://cdn.example.com/ana.jpg',
    });
    expect(capturedPatchBody).not.toHaveProperty('userId');
  });

  it('editar preservando o avatar existente (sem trocar arquivo): PATCH usa o mesmo avatarUrl, sem chamada de upload', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>(async () => jsonResponse(200, baseAuthor));
    global.fetch = fetchMock;
    renderDetail();

    await screen.findByLabelText('Nome');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/authors/11111111-1111-4111-8111-111111111111'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/uploads/images'), expect.anything());
  });

  it('excluir: confirmação aceita chama DELETE e redireciona para a lista', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return emptyResponse(204);
      }
      return jsonResponse(200, baseAuthor);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/fastcompre/authors'));
  });

  it('excluir: confirmação recusada não chama DELETE nem navega', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseAuthor));
    global.fetch = fetchMock;
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('excluir: conflito (409, vinculado a Artigo) mostra a mensagem da API, permanece na página', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Este Autor está vinculado a um ou mais Artigos e não pode ser excluído.',
        });
      }
      return jsonResponse(200, baseAuthor);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText('Este Autor está vinculado a um ou mais Artigos e não pode ser excluído.'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
