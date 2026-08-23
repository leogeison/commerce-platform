import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Role } from '@commerce-platform/contracts';
import { CategoryDetail } from './category-detail';
import { SiteRoleProvider } from '../../site-role-context';
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

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 (form + os três botões de ciclo de vida
 * sempre visíveis) — os testes específicos de `VIEWER`/`EDITOR` passam a
 * Role explicitamente.
 */
function renderDetail(role: Role = 'OWNER') {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <SiteRoleProvider value={role}>
          <CategoryDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
        </SiteRoleProvider>
      </UnsavedChangesProvider>
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

const baseCategory = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  name: 'Eletrônicos',
  slug: 'eletronicos',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CategoryDetail', () => {
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
        message: 'Categoria não encontrada.',
      }),
    );
    renderDetail();

    expect(await screen.findByText('Categoria não encontrada.')).toBeInTheDocument();
  });

  it('sucesso (categoria ativa): preenche o formulário e mostra o botão "Arquivar"', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseCategory));
    renderDetail();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Eletrônicos');
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).not.toBeInTheDocument();
  });

  it('sucesso (categoria arquivada): mostra o botão "Desarquivar"', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { ...baseCategory, archivedAt: '2026-01-02T00:00:00.000Z' }));
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
  });

  it('editar com sucesso: atualiza o estado local, permanece na página', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(200, { ...baseCategory, name: 'Eletrônicos e Acessórios' });
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Eletrônicos e Acessórios');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Eletrônicos e Acessórios'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('arquivar com sucesso: atualiza o estado e troca o botão para "Desarquivar"', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(200, { ...baseCategory, archivedAt: '2026-01-02T00:00:00.000Z' });
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('button', { name: 'Desarquivar' })).toBeInTheDocument();
  });

  it('arquivar com falha: mostra mensagem de erro acessível, estado não muda (mesmo mecanismo cobre unarchive)', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(500, { unexpected: 'shape' });
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(
      await screen.findByText('Não foi possível concluir esta ação. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('excluir: confirmação aceita chama DELETE e redireciona para a lista', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return emptyResponse(204);
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/fastcompre/categories'));
  });

  it('excluir: confirmação recusada não chama DELETE nem navega', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseCategory));
    global.fetch = fetchMock;
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('excluir: conflito (409, vinculada a Artigo) mostra a mensagem da API, permanece na página', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Esta Categoria está vinculada a um ou mais Artigos e não pode ser excluída.',
        });
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText('Esta Categoria está vinculada a um ou mais Artigos e não pode ser excluída.'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- ADM-012: visibilidade por Role ---

  it('EDITOR: mostra o CategoryForm, sem nenhum botão de ciclo de vida', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseCategory));
    renderDetail('EDITOR');

    expect(await screen.findByLabelText('Nome')).toHaveValue('Eletrônicos');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('VIEWER: mostra CategoryReadOnly, sem CategoryForm nem nenhum botão', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, baseCategory));
    renderDetail('VIEWER');

    expect(await screen.findByRole('heading', { name: 'Eletrônicos' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // --- UXA-001: LoadingState/ErrorState compartilhados ---

  it('UXA-001: estado de loading não usa role="alert" e não trava foco (sem violação de acessibilidade)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail();

    const loadingNode = screen.getByText('Carregando...');
    expect(loadingNode).not.toHaveAttribute('role', 'alert');
    expect(loadingNode).not.toHaveAttribute('tabindex');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('UXA-001: erro de carregamento (404) é anunciado via role="alert" (sem violação de acessibilidade)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(404, {
        statusCode: 404,
        code: 'NOT_FOUND',
        error: 'Not Found',
        message: 'Categoria não encontrada.',
      }),
    );
    const { container } = renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Categoria não encontrada.');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('UXA-001: erro de ação (falha ao arquivar) é anunciado via role="alert"', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(500, { unexpected: 'shape' });
      }
      return jsonResponse(200, baseCategory);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir esta ação. Tente novamente em instantes.',
    );
  });
});
