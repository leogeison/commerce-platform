import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { Role } from '@commerce-platform/contracts';
import { TYPE_LABELS } from '../../lib/article-labels';
import { Dashboard } from './dashboard';
import { SiteRoleProvider } from './site-role-context';

function makeArticleSummary(
  overrides: Partial<{
    id: string;
    title: string;
    status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
    updatedAt: string;
    publishedAt: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: overrides.status ?? 'DRAFT',
    title: overrides.title ?? 'Rascunho em andamento',
    slug: 'rascunho-em-andamento',
    metaDescription: null,
    coverImageUrl: null,
    publishedAt: overrides.publishedAt ?? null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-20T15:30:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyEnvelope(pageSize = 5) {
  return { items: [], page: 1, pageSize, total: 0, totalPages: 0 };
}

/**
 * As três seções pedem URLs diferentes só no `status` (e no `orderBy`,
 * quando presente) — nunca em `page`/`pageSize`. `statusOf` extrai o
 * `status` da URL requisitada para rotear cada chamada de `fetch` para a
 * resposta certa, permitindo testar as três seções de forma independente
 * mesmo com um único `global.fetch` mockado (mesma restrição já existente
 * antes desta tarefa — o componente usa o `fetch` global, não um cliente
 * por seção).
 */
function statusOf(input: unknown): string | null {
  return new URL(String(input)).searchParams.get('status');
}

/**
 * `responses` mapeia `status` → `Response` (ou uma Promise que nunca
 * resolve, para simular uma seção eternamente em loading em testes que só
 * querem isolar as outras duas). Uma seção cujo `status` não está no mapa
 * lança — sinal de teste mal configurado, não comportamento real do
 * componente.
 */
function mockFetchByStatus(
  responses: Partial<Record<'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED', Response | Promise<never>>>,
) {
  return jest.fn<typeof fetch>().mockImplementation((input) => {
    const status = statusOf(input);
    const response = status !== null ? responses[status as keyof typeof responses] : undefined;
    if (response === undefined) {
      throw new Error(`teste não configurou resposta para status=${String(status)}`);
    }
    return Promise.resolve(response) as unknown as Promise<Response>;
  });
}

/**
 * `role` default `'VIEWER'` (UXA-019) — preserva o comportamento exato de
 * todos os testes já existentes antes desta tarefa: com `VIEWER`, nenhum
 * dos 4 atalhos de criação é renderizado, então as asserções antigas que
 * já verificavam "nenhum link" em seções vazias (`queryByRole('link'))
 * .not.toBeInTheDocument()`) continuam válidas sem nenhuma alteração nelas
 * — só os testes novos desta tarefa passam `role` explicitamente
 * (`EDITOR`/`OWNER`) para exercitar os atalhos.
 */
function renderDashboard(role: Role = 'VIEWER') {
  return render(
    <SiteRoleProvider value={role}>
      <Dashboard siteSlug="fastcompre" />
    </SiteRoleProvider>,
  );
}

describe('Dashboard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: as três seções mostram "Carregando..." simultaneamente', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(screen.getAllByText('Carregando...')).toHaveLength(3);
  });

  it('requests: as três seções disparam em paralelo, sem waterfall (fetch chamado 3× antes de qualquer uma resolver)', () => {
    const fetchMock = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    global.fetch = fetchMock;

    renderDashboard();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('erro genérico em "Continuar de onde parei": mostra mensagem específica da seção, sem afetar as outras duas', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(500, { unexpected: 'shape' }),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    expect(
      await screen.findByText('Não foi possível carregar os rascunhos. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo aguardando publicação.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo publicado recentemente.')).toBeInTheDocument();
  });

  it('erro genérico em "Aguardando publicação": mostra mensagem específica da seção, sem afetar as outras duas', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(500, { unexpected: 'shape' }),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    expect(
      await screen.findByText(
        'Não foi possível carregar os Artigos aguardando publicação. Tente novamente em instantes.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nenhum rascunho em andamento.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo publicado recentemente.')).toBeInTheDocument();
  });

  it('erro genérico em "Publicados recentemente": mostra mensagem específica da seção, sem afetar as outras duas', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(500, { unexpected: 'shape' }),
    });
    renderDashboard();

    expect(
      await screen.findByText(
        'Não foi possível carregar os Artigos publicados recentemente. Tente novamente em instantes.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nenhum rascunho em andamento.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo aguardando publicação.')).toBeInTheDocument();
  });

  it('lista vazia nas três seções: textos contextuais próprios, sem nenhum CTA de criação nem controle de paginação', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    expect(await screen.findByText('Nenhum rascunho em andamento.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo aguardando publicação.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Artigo publicado recentemente.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('"Continuar de onde parei" com item: título como link para /:id e data de atualização formatada (pt-BR) — inalterado desde a UXA-017', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026', updatedAt: '2026-08-20T15:30:00.000Z' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    expect(link).toHaveAttribute('href', '/fastcompre/articles/11111111-1111-4111-8111-111111111111');
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          `Atualizado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date('2026-08-20T15:30:00.000Z'))}`,
      ),
    ).toBeInTheDocument();
  });

  it('"Aguardando publicação" com item: título como link, sem nenhuma linha secundária de data (não existe timestamp de "entrada em revisão")', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Aguardando revisão final',
            status: 'PENDING_REVIEW',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Aguardando revisão final' });
    expect(link).toHaveAttribute('href', '/fastcompre/articles/33333333-3333-4333-8333-333333333333');
    expect(link.closest('li')).toHaveTextContent('Aguardando revisão final');
    expect(screen.queryByText(/enviado para revisão/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/atualizado em/i)).not.toBeInTheDocument();
  });

  it('"Publicados recentemente" com item: título como link e data de publicação formatada (pt-BR) — usa publishedAt, não createdAt', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '44444444-4444-4444-8444-444444444444',
            title: 'Melhor cafeteira 2026',
            status: 'PUBLISHED',
            publishedAt: '2026-08-15T09:00:00.000Z',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Melhor cafeteira 2026' });
    expect(link).toHaveAttribute('href', '/fastcompre/articles/44444444-4444-4444-8444-444444444444');
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          `Publicado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date('2026-08-15T09:00:00.000Z'))}`,
      ),
    ).toBeInTheDocument();
  });

  it('"Publicados recentemente" com publishedAt nulo (inconsistência que a invariante de publicação não deveria permitir): renderiza o link sem linha secundária, sem mascarar com outra data', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '55555555-5555-4555-8555-555555555555',
            title: 'Artigo com publishedAt inconsistente',
            status: 'PUBLISHED',
            publishedAt: null,
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Artigo com publishedAt inconsistente' });
    expect(link.closest('li')).toHaveTextContent('Artigo com publishedAt inconsistente');
    expect(screen.queryByText(/publicado em/i)).not.toBeInTheDocument();
  });

  it('requests: page=1, pageSize=5, status/orderBy corretos por seção — sem controle de paginação nem "Ver todos" em nenhuma', async () => {
    const fetchMock = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    global.fetch = fetchMock;

    renderDashboard();
    await screen.findByText('Nenhum rascunho em andamento.');
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((call) => new URL(String(call[0])));

    const draftsUrl = urls.find((url) => url.searchParams.get('status') === 'DRAFT')!;
    expect(draftsUrl.pathname).toBe('/admin/sites/fastcompre/articles');
    expect(draftsUrl.searchParams.get('page')).toBe('1');
    expect(draftsUrl.searchParams.get('pageSize')).toBe('5');
    expect(draftsUrl.searchParams.get('orderBy')).toBe('updatedAt_desc');

    const pendingReviewUrl = urls.find((url) => url.searchParams.get('status') === 'PENDING_REVIEW')!;
    expect(pendingReviewUrl.pathname).toBe('/admin/sites/fastcompre/articles');
    expect(pendingReviewUrl.searchParams.get('page')).toBe('1');
    expect(pendingReviewUrl.searchParams.get('pageSize')).toBe('5');
    expect(pendingReviewUrl.searchParams.has('orderBy')).toBe(false);

    const publishedUrl = urls.find((url) => url.searchParams.get('status') === 'PUBLISHED')!;
    expect(publishedUrl.pathname).toBe('/admin/sites/fastcompre/articles');
    expect(publishedUrl.searchParams.get('page')).toBe('1');
    expect(publishedUrl.searchParams.get('pageSize')).toBe('5');
    expect(publishedUrl.searchParams.get('orderBy')).toBe('publishedAt_desc');

    expect(screen.queryByRole('button', { name: /anterior|próxima|ver todos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver todos/i })).not.toBeInTheDocument();
  });

  it('estrutura acessível: as três seções são regiões identificáveis via aria-labelledby, cada uma com seu heading próprio (nível 2)', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    await screen.findByText('Nenhum rascunho em andamento.');
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');

    const draftsRegion = screen.getByRole('region', { name: 'Continuar de onde parei' });
    expect(draftsRegion.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 2, name: 'Continuar de onde parei' })).toBeInTheDocument();

    const pendingReviewRegion = screen.getByRole('region', { name: 'Aguardando publicação' });
    expect(pendingReviewRegion.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 2, name: 'Aguardando publicação' })).toBeInTheDocument();

    const publishedRegion = screen.getByRole('region', { name: 'Publicados recentemente' });
    expect(publishedRegion.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 2, name: 'Publicados recentemente' })).toBeInTheDocument();
  });

  it('ordem do DOM: Continuar → Aguardando → Publicados', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    const { container } = renderDashboard();

    await screen.findByText('Nenhum rascunho em andamento.');
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');

    const headings = within(container).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Continuar de onde parei', 'Aguardando publicação', 'Publicados recentemente']);
  });

  it('não tem violação de acessibilidade (jest-axe) com as três seções populadas', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Aguardando revisão final',
            status: 'PENDING_REVIEW',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
      PUBLISHED: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '44444444-4444-4444-8444-444444444444',
            title: 'Melhor cafeteira 2026',
            status: 'PUBLISHED',
            publishedAt: '2026-08-15T09:00:00.000Z',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    const { container } = renderDashboard();

    await screen.findByRole('link', { name: 'Melhores fones 2026' });
    await screen.findByRole('link', { name: 'Aguardando revisão final' });
    await screen.findByRole('link', { name: 'Melhor cafeteira 2026' });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('não tem violação de acessibilidade (jest-axe) com as três seções vazias', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    const { container } = renderDashboard();

    await screen.findByText('Nenhum rascunho em andamento.');
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');

    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXA-019: atalhos de criação role-gated ---

  it('atalhos de criação: VIEWER não vê nenhum dos 4', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard('VIEWER');

    await screen.findByText('Nenhum rascunho em andamento.');

    expect(screen.queryByRole('link', { name: 'Novo Artigo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Novo Produto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova Categoria' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Novo Autor' })).not.toBeInTheDocument();
  });

  it.each(['EDITOR', 'OWNER'] as const)(
    'atalhos de criação: %s vê os 4, na ordem de CREATE_ACTIONS, com hrefs corretos',
    async (role) => {
      global.fetch = mockFetchByStatus({
        DRAFT: jsonResponse(200, emptyEnvelope()),
        PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
        PUBLISHED: jsonResponse(200, emptyEnvelope()),
      });
      renderDashboard(role);

      await screen.findByText('Nenhum rascunho em andamento.');

      // Seções vazias nesta rodada: os únicos 4 links da página são os
      // atalhos — ordem capturada diretamente do DOM, sem depender de
      // 4 `findByRole` isolados, para provar a ordem real de renderização,
      // não só a presença de cada um. UXA-019A (revisão): cada card agora
      // tem um subtítulo visível dentro do `<Link>`, então `.textContent`
      // deixou de refletir só o rótulo — a asserção passa a usar
      // `aria-label` (o nome acessível real do card, ver doc comment de
      // `CreateShortcuts`), não o texto bruto do DOM.
      const shortcutLinks = screen.getAllByRole('link');
      expect(shortcutLinks.map((link) => link.getAttribute('aria-label'))).toEqual([
        'Novo Artigo',
        'Novo Produto',
        'Nova Categoria',
        'Novo Autor',
      ]);
      expect(shortcutLinks.map((link) => link.getAttribute('href'))).toEqual([
        '/fastcompre/articles/new',
        '/fastcompre/products/new',
        '/fastcompre/categories/new',
        '/fastcompre/authors/new',
      ]);
    },
  );

  it('atalhos de criação: aparecem antes de "Continuar de onde parei" no DOM (topo do Dashboard)', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    const { container } = renderDashboard('EDITOR');

    await screen.findByText('Nenhum rascunho em andamento.');

    const novoArtigoLink = screen.getByRole('link', { name: 'Novo Artigo' });
    const draftsHeading = screen.getByRole('heading', { level: 2, name: 'Continuar de onde parei' });
    // `DOCUMENT_POSITION_FOLLOWING` no heading, visto a partir do link de
    // atalho, confirma que o atalho vem antes dele no DOM — mesma checagem
    // de ordem já usada no teste "ordem do DOM", agora relacionando
    // atalhos e primeira seção.
    expect(
      novoArtigoLink.compareDocumentPosition(draftsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('a')).toBe(novoArtigoLink);
  });

  it('não tem violação de acessibilidade (jest-axe) com os 4 atalhos de criação visíveis (EDITOR) e as três seções populadas', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Aguardando revisão final',
            status: 'PENDING_REVIEW',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
      PUBLISHED: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '44444444-4444-4444-8444-444444444444',
            title: 'Melhor cafeteira 2026',
            status: 'PUBLISHED',
            publishedAt: '2026-08-15T09:00:00.000Z',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    const { container } = renderDashboard('EDITOR');

    await screen.findByRole('link', { name: 'Melhores fones 2026' });
    await screen.findByRole('link', { name: 'Aguardando revisão final' });
    await screen.findByRole('link', { name: 'Melhor cafeteira 2026' });
    await screen.findByRole('link', { name: 'Novo Artigo' });

    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXA-019: teste formal de falha parcial (reservado desde a UXA-018) ---

  it('falha parcial: "Aguardando publicação" falha enquanto "Continuar de onde parei" e "Publicados recentemente" continuam legíveis com dado real', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(500, { unexpected: 'shape' }),
      PUBLISHED: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [
          makeArticleSummary({
            id: '44444444-4444-4444-8444-444444444444',
            title: 'Melhor cafeteira 2026',
            status: 'PUBLISHED',
            publishedAt: '2026-08-15T09:00:00.000Z',
          }),
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    renderDashboard();

    // As três asserções coexistem na mesma renderização: a seção que falhou
    // mostra seu próprio erro, e as outras duas mostram dado real e
    // navegável — não apenas "não travou", mas "continuam legíveis e
    // funcionais", exatamente o critério de aceite da UXA-019.
    const errorMessage = await screen.findByText(
      'Não foi possível carregar os Artigos aguardando publicação. Tente novamente em instantes.',
    );
    const draftLink = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    const publishedLink = await screen.findByRole('link', { name: 'Melhor cafeteira 2026' });

    expect(errorMessage).toBeInTheDocument();
    expect(draftLink).toHaveAttribute('href', '/fastcompre/articles/11111111-1111-4111-8111-111111111111');
    expect(publishedLink).toHaveAttribute(
      'href',
      '/fastcompre/articles/44444444-4444-4444-8444-444444444444',
    );
    // A seção com erro não deixa nenhum item órfão nem estado "ready"
    // parcial — só a mensagem de erro, nunca uma lista vazia junto dela.
    expect(screen.queryByText('Nenhum Artigo aguardando publicação.')).not.toBeInTheDocument();
  });

  // --- UXA-019A: cabeçalho, descrição editorial e badge de Tipo ---

  it('<h1> "Dashboard" está presente com o nível de heading correto', () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('descrição editorial estática está visível', () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    expect(
      screen.getByText('Acompanhe seu fluxo editorial e retome o trabalho rapidamente.'),
    ).toBeInTheDocument();
  });

  it('badge de Tipo (TYPE_LABELS) fica visível associado ao item, e o link do título continua resolvendo pelo título exato', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    expect(link).toHaveAttribute('href', '/fastcompre/articles/11111111-1111-4111-8111-111111111111');
    expect(link.closest('li')).toHaveTextContent(TYPE_LABELS.REVIEW);
  });

  // --- UXA-019A (revisão): cards de atalho, ícones decorativos, linha
  // inteira clicável ---

  it('card de atalho: nome acessível continua sendo action.label mesmo com o subtítulo visível (aria-label sobrepõe o conteúdo textual)', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, emptyEnvelope()),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard('EDITOR');
    await screen.findByText('Nenhum rascunho em andamento.');

    // O subtítulo é conteúdo visível de verdade (não `aria-hidden`) — deve
    // aparecer via `getByText` normal — mas o nome acessível do link
    // (usado por `getByRole`/leitor de tela) continua sendo só o rótulo,
    // graças ao `aria-label`.
    const link = screen.getByRole('link', { name: 'Novo Artigo' });
    expect(link).toHaveAttribute('aria-label', 'Novo Artigo');
    expect(screen.getByText('Criar um novo artigo editorial')).toBeInTheDocument();
    expect(link.textContent).toContain('Criar um novo artigo editorial');
    expect(link.textContent).not.toBe('Novo Artigo');
  });

  it('ícones decorativos (headings, linha de Artigo e cards de atalho) são todos aria-hidden — não interferem em nenhum nome acessível', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard('EDITOR');

    const articleLink = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');

    const heading = screen.getByRole('heading', { level: 2, name: 'Continuar de onde parei' });
    expect(heading.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const cardLink = screen.getByRole('link', { name: 'Novo Artigo' });
    expect(cardLink.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const row = articleLink.closest('li');
    expect(row).not.toBeNull();
    // FileText (início) + ChevronRight (fim) — dois ícones decorativos por
    // linha, nenhum deles filho do `<Link>` do título.
    expect(row!.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    expect(articleLink.querySelector('svg')).toBeNull();
  });

  it('linha de Artigo: a área inteira (ícone, badge, data, chevron) é coberta por um único Link — nenhum controle interativo concorrente dentro da linha', async () => {
    global.fetch = mockFetchByStatus({
      DRAFT: jsonResponse(200, {
        ...emptyEnvelope(),
        items: [makeArticleSummary({ title: 'Melhores fones 2026' })],
        total: 1,
        totalPages: 1,
      }),
      PENDING_REVIEW: jsonResponse(200, emptyEnvelope()),
      PUBLISHED: jsonResponse(200, emptyEnvelope()),
    });
    renderDashboard();

    const articleLink = await screen.findByRole('link', { name: 'Melhores fones 2026' });
    await screen.findByText('Nenhum Artigo aguardando publicação.');
    await screen.findByText('Nenhum Artigo publicado recentemente.');
    const row = articleLink.closest('li');
    expect(row).not.toBeNull();

    // Um único elemento com role "link" (ou qualquer outro role
    // interativo) dentro da linha — a área ampliada de clique (stretched
    // link) não introduz nenhum segundo alvo interativo.
    expect(within(row!).getAllByRole('link')).toHaveLength(1);
    expect(within(row!).queryAllByRole('button')).toHaveLength(0);
    // `article.title` continua sendo o único filho de texto real do Link
    // (o pseudo-elemento `after:` não é um nó do DOM).
    expect(articleLink.textContent).toBe('Melhores fones 2026');
  });
});
