import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ArticleAdmin, ArticleStatus } from '@commerce-platform/contracts';
import { ArticleTransitionPanel } from './article-transition-panel';

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

describe('ArticleTransitionPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DRAFT: renderiza só "Enviar para revisão"', () => {
    global.fetch = jest.fn<typeof fetch>();
    render(
      <ArticleTransitionPanel siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="DRAFT" onTransition={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar para rascunho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar para rascunho' })).not.toBeInTheDocument();
  });

  it('PENDING_REVIEW: renderiza "Publicar" e "Voltar para rascunho", nessa ordem', () => {
    global.fetch = jest.fn<typeof fetch>();
    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PENDING_REVIEW"
        onTransition={jest.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Publicar');
    expect(buttons[1]).toHaveTextContent('Voltar para rascunho');
  });

  it('PUBLISHED: renderiza só "Arquivar"', () => {
    global.fetch = jest.fn<typeof fetch>();
    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PUBLISHED"
        onTransition={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('ARCHIVED: renderiza só "Restaurar para rascunho"', () => {
    global.fetch = jest.fn<typeof fetch>();
    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="ARCHIVED"
        onTransition={jest.fn()}
      />,
    );

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

      render(
        <ArticleTransitionPanel
          siteSlug={SITE_SLUG}
          articleId={ARTICLE_ID}
          status={status}
          onTransition={onTransition}
        />,
      );

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

    render(
      <ArticleTransitionPanel siteSlug={SITE_SLUG} articleId={ARTICLE_ID} status="PUBLISHED" onTransition={jest.fn()} />,
    );

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

    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PENDING_REVIEW"
        onTransition={jest.fn()}
      />,
    );

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

    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PUBLISHED"
        onTransition={onTransition}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByText('Somente Artigos em PUBLISHED podem ser arquivados.')).toBeInTheDocument();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it('404: mostra a message da API', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async () =>
      jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Artigo não encontrado.' }),
    );

    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="ARCHIVED"
        onTransition={jest.fn()}
      />,
    );

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

    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PENDING_REVIEW"
        onTransition={jest.fn()}
      />,
    );

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

    render(
      <ArticleTransitionPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status="PUBLISHED"
        onTransition={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Arquivar' }));

    expect(
      await screen.findByText('Não foi possível concluir a ação. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });
});
