import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ArticleAdmin, ArticleStatus, Role } from '@commerce-platform/contracts';
import { ArticleTransitionPanel } from './article-transition-panel';
import { SiteRoleProvider } from '../../site-role-context';

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function makeArticle(overrides: Partial<ArticleAdmin> = {}): ArticleAdmin {
  return {
    id: ARTICLE_ID,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'PENDING_REVIEW',
    title: 'Melhor fone Bluetooth',
    slug: 'melhor-fone-bluetooth',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx: '',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function transitionUrl(path: string): string {
  return `/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/${path}`;
}

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 (todos os botões previstos para o status
 * aparecem) — os testes específicos de `VIEWER`/`EDITOR` passam a Role
 * explicitamente.
 */
function renderPanel(
  props: {
    status: ArticleStatus;
    onTransition: (article: ArticleAdmin) => void;
    // UXE-015 — opcional: ausente em todos os testes pré-existentes acima
    // (regressão: comportamento idêntico a antes desta tarefa, POST direto
    // sem nenhuma checagem prévia).
    onBeforeTransition?: () => Promise<boolean>;
  },
  role: Role = 'OWNER',
) {
  return render(
    <SiteRoleProvider value={role}>
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status={props.status}
        onTransition={props.onTransition}
        onBeforeTransition={props.onBeforeTransition}
      />
    </SiteRoleProvider>,
  );
}

describe('ArticleTransitionPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DRAFT: renderiza só "Enviar para revisão"', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'DRAFT', onTransition: jest.fn() });

    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar para rascunho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar para rascunho' })).not.toBeInTheDocument();
  });

  it('PENDING_REVIEW: renderiza "Publicar" e "Voltar para rascunho", nessa ordem', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'PENDING_REVIEW', onTransition: jest.fn() });

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Publicar');
    expect(buttons[1]).toHaveTextContent('Voltar para rascunho');
  });

  it('PUBLISHED: renderiza só "Arquivar"', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'PUBLISHED', onTransition: jest.fn() });

    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('ARCHIVED: renderiza só "Restaurar para rascunho"', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'ARCHIVED', onTransition: jest.fn() });

    expect(screen.getByRole('button', { name: 'Restaurar para rascunho' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  const transitionCases: Array<{ status: ArticleStatus; label: string; path: string; nextStatus: ArticleStatus }> = [
    { status: 'DRAFT', label: 'Enviar para revisão', path: 'submit-for-review', nextStatus: 'PENDING_REVIEW' },
    { status: 'PENDING_REVIEW', label: 'Publicar', path: 'publish', nextStatus: 'PUBLISHED' },
    { status: 'PENDING_REVIEW', label: 'Voltar para rascunho', path: 'revert-to-draft', nextStatus: 'DRAFT' },
    { status: 'PUBLISHED', label: 'Arquivar', path: 'archive', nextStatus: 'ARCHIVED' },
    { status: 'ARCHIVED', label: 'Restaurar para rascunho', path: 'restore-to-draft', nextStatus: 'DRAFT' },
  ];

  it.each(transitionCases)(
    '$label ($status): POST $path, sem corpo, onTransition recebe o ArticleAdmin da resposta',
    async ({ status, label, path, nextStatus }) => {
      const user = userEvent.setup();
      const updatedArticle = makeArticle({ status: nextStatus });
      let capturedUrl: string | undefined;
      let capturedInit: RequestInit | undefined;
      global.fetch = jest.fn<typeof fetch>(async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return jsonResponse(200, updatedArticle);
      });
      const onTransition = jest.fn<(article: ArticleAdmin) => void>();

      renderPanel({ status, onTransition });

      await user.click(screen.getByRole('button', { name: label }));

      await waitFor(() => expect(onTransition).toHaveBeenCalledWith(updatedArticle));
      expect(capturedUrl).toContain(transitionUrl(path));
      expect(capturedInit?.method).toBe('POST');
      expect(capturedInit?.body).toBeUndefined();
    },
  );

  it('clique concorrente: clicar duas vezes rápido resulta em exatamente 1 chamada HTTP', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = jest.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderPanel({ status: 'PUBLISHED', onTransition: jest.fn() });

    const button = screen.getByRole('button', { name: 'Arquivar' });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse(200, makeArticle({ status: 'ARCHIVED' })));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('clique em outra ação enquanto a primeira está em voo também é ignorado', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = jest.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderPanel({ status: 'PENDING_REVIEW', onTransition: jest.fn() });

    const publishButton = screen.getByRole('button', { name: 'Publicar' });
    await user.click(publishButton);
    await user.click(screen.getByRole('button', { name: 'Voltar para rascunho' }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse(200, makeArticle({ status: 'PUBLISHED' })));
    await waitFor(() => expect(publishButton).not.toBeDisabled());
  });

  it('409: mostra a message da API, onTransition não é chamado', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async () =>
      jsonResponse(409, {
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Somente Artigos em PUBLISHED podem ser arquivados.',
      }),
    );
    const onTransition = jest.fn();

    renderPanel({ status: 'PUBLISHED', onTransition });

    await user.click(screen.getByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByText('Somente Artigos em PUBLISHED podem ser arquivados.')).toBeInTheDocument();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it('404: mostra a message da API', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async () =>
      jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Artigo não encontrado.' }),
    );

    renderPanel({ status: 'ARCHIVED', onTransition: jest.fn() });

    await user.click(screen.getByRole('button', { name: 'Restaurar para rascunho' }));

    expect(await screen.findByText('Artigo não encontrado.')).toBeInTheDocument();
  });

  it('422 (publish): mostra somente a message da API, nunca interpreta details.issues', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async () =>
      jsonResponse(422, {
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        error: 'Unprocessable Entity',
        message: 'Não é possível publicar: uma ou mais condições de publicação não foram atendidas.',
        details: { issues: ['NO_PRODUCTS', 'COVER_IMAGE_MISSING'] },
      }),
    );

    renderPanel({ status: 'PENDING_REVIEW', onTransition: jest.fn() });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      await screen.findByText('Não é possível publicar: uma ou mais condições de publicação não foram atendidas.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NO_PRODUCTS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/COVER_IMAGE_MISSING/)).not.toBeInTheDocument();
  });

  it('erro genérico (500): mostra mensagem local genérica', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));

    renderPanel({ status: 'PUBLISHED', onTransition: jest.fn() });

    await user.click(screen.getByRole('button', { name: 'Arquivar' }));

    expect(
      await screen.findByText('Não foi possível concluir a ação. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  // --- ADM-012: visibilidade por Role ---

  it('EDITOR em PENDING_REVIEW: vê "Publicar" e "Voltar para rascunho" (ambos EDITOR)', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'PENDING_REVIEW', onTransition: jest.fn() }, 'EDITOR');

    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar para rascunho' })).toBeInTheDocument();
  });

  it('EDITOR em PUBLISHED: não vê nenhum botão (archive exige OWNER) — retorna null, sem seção vazia', () => {
    global.fetch = jest.fn<typeof fetch>();
    const { container } = renderPanel({ status: 'PUBLISHED', onTransition: jest.fn() }, 'EDITOR');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('EDITOR em ARCHIVED: não vê nenhum botão (restore-to-draft exige OWNER)', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'ARCHIVED', onTransition: jest.fn() }, 'EDITOR');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('OWNER: vê todos os botões previstos para o status, em qualquer status (mesmo comportamento de antes da ADM-012)', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'PUBLISHED', onTransition: jest.fn() }, 'OWNER');

    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('VIEWER: não vê nenhum botão em nenhum status', () => {
    global.fetch = jest.fn<typeof fetch>();
    renderPanel({ status: 'DRAFT', onTransition: jest.fn() }, 'VIEWER');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // --- UXE-015: onBeforeTransition ---

  it('onBeforeTransition resolve true: é chamado ANTES do POST de transição, que segue normalmente', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const updatedArticle = makeArticle({ status: 'PENDING_REVIEW' });
    global.fetch = jest.fn<typeof fetch>(async () => {
      order.push('post');
      return jsonResponse(200, updatedArticle);
    });
    const onBeforeTransition = jest.fn<() => Promise<boolean>>(async () => {
      order.push('onBeforeTransition');
      return true;
    });
    const onTransition = jest.fn<(article: ArticleAdmin) => void>();

    renderPanel({ status: 'DRAFT', onTransition, onBeforeTransition });

    await user.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    await waitFor(() => expect(onTransition).toHaveBeenCalledWith(updatedArticle));
    expect(order).toEqual(['onBeforeTransition', 'post']);
    expect(onBeforeTransition).toHaveBeenCalledTimes(1);
  });

  it('onBeforeTransition resolve false: bloqueia a transição, nenhum POST é feito, mostra erro perceptível e reabilita o botão', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>();
    const onBeforeTransition = jest.fn<() => Promise<boolean>>(async () => false);
    const onTransition = jest.fn<(article: ArticleAdmin) => void>();

    renderPanel({ status: 'DRAFT', onTransition, onBeforeTransition });

    const button = screen.getByRole('button', { name: 'Enviar para revisão' });
    await user.click(button);

    expect(
      await screen.findByText(
        'Não foi possível salvar as últimas alterações do corpo do Artigo. Tente novamente antes de mudar o status.',
      ),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('onBeforeTransition rejeita: tratado defensivamente como false, mesmo bloqueio, nenhum POST', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>();
    const onBeforeTransition = jest.fn<() => Promise<boolean>>(async () => {
      throw new Error('falha inesperada');
    });
    const onTransition = jest.fn<(article: ArticleAdmin) => void>();

    renderPanel({ status: 'DRAFT', onTransition, onBeforeTransition });

    const button = screen.getByRole('button', { name: 'Enviar para revisão' });
    await user.click(button);

    expect(
      await screen.findByText(
        'Não foi possível salvar as últimas alterações do corpo do Artigo. Tente novamente antes de mudar o status.',
      ),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('sem onBeforeTransition: comportamento idêntico a antes da UXE-015, POST direto', async () => {
    const user = userEvent.setup();
    const updatedArticle = makeArticle({ status: 'PENDING_REVIEW' });
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(200, updatedArticle));
    const onTransition = jest.fn<(article: ArticleAdmin) => void>();

    renderPanel({ status: 'DRAFT', onTransition });

    await user.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    await waitFor(() => expect(onTransition).toHaveBeenCalledWith(updatedArticle));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
