import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ArticleAdmin, ArticleStatus, Role } from '@commerce-platform/contracts';
import { ArticleContextPanel } from './article-context-panel';
import { SiteRoleProvider } from '../../site-role-context';

/**
 * apps/admin/src/app/[siteSlug]/articles/[id]/article-context-panel.spec.tsx
 *
 * UXE-012 — Painel lateral contextual do Artigo (desktop).
 *
 * Testa `ArticleContextPanel` ISOLADO (sem `ArticleDetail`) — mesmo
 * critério já usado por `article-transition-panel.spec.tsx`/
 * `article-health-checklist.spec.tsx`: os dois componentes internos
 * (`ArticleHealthChecklist`/`ArticleTransitionPanel`) não são mockados
 * aqui, só a fronteira de rede (`fetch`), porque o objetivo é provar que
 * a CASCA de composição (heading, `aria-labelledby`, badge, uma única
 * montagem de cada filho) funciona de ponta a ponta com o comportamento
 * real desses dois componentes — não reimplementa a cobertura já
 * existente e completa de cada um deles individualmente (framing por
 * status, `MIN_ROLE_BY_TRANSITION`, `pendingAction`, etc.), que continua
 * em seus próprios specs, intocados por esta tarefa.
 *
 * A presença do painel nas DUAS composições de `ArticleDetail` (DRAFT
 * editável e read-only) é coberta em `article-detail.spec.tsx`, não
 * aqui — este arquivo cobre só o componente em si.
 */

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';

const STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_REVIEW: 'Em revisão',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

const HEALTH_FRAMING_BY_STATUS: Record<ArticleStatus, string> = {
  DRAFT: 'Preparação do Artigo',
  PENDING_REVIEW: 'Prontidão para publicação',
  PUBLISHED: 'Saúde operacional',
  ARCHIVED: 'Informações de saúde',
};

const TRANSITION_PATH_PATTERN = /\/(submit-for-review|revert-to-draft|publish|archive|restore-to-draft)$/;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function healthyResponse() {
  return {
    categoryActive: true,
    hasAtLeastOneProduct: true,
    allProductsHaveValidOffer: true,
    invalidProducts: [],
    slugUnique: true,
    metaDescriptionFilled: true,
    coverImagePresent: true,
    healthy: true,
  };
}

function catalogResponse(items: unknown[] = []) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
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

function mockFetch(options: { transition?: () => Response } = {}) {
  const fetchMock = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST' && TRANSITION_PATH_PATTERN.test(url)) {
      return options.transition ? options.transition() : jsonResponse(200, makeArticle({ status: 'PUBLISHED' }));
    }
    if (url.endsWith('/health')) {
      return jsonResponse(200, healthyResponse());
    }
    return catalogResponse();
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function renderPanel(
  status: ArticleStatus,
  onTransition: (article: ArticleAdmin) => void = jest.fn(),
  role: Role = 'OWNER',
) {
  return render(
    <SiteRoleProvider value={role}>
      <ArticleContextPanel
        siteSlug={SITE_SLUG}
        articleId={ARTICLE_ID}
        status={status}
        healthRefreshKey={0}
        onTransition={onTransition}
      />
    </SiteRoleProvider>,
  );
}

describe('ArticleContextPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('região complementary com nome acessível derivado do heading visível via aria-labelledby', async () => {
    mockFetch();
    renderPanel('DRAFT');

    const heading = await screen.findByRole('heading', { level: 2, name: 'Status do Artigo' });
    const region = screen.getByRole('complementary', { name: 'Status do Artigo' });
    expect(region).toContainElement(heading);
  });

  it.each<ArticleStatus>(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'])(
    'badge mostra o rótulo de status correto para %s',
    async (status) => {
      mockFetch();
      renderPanel(status);

      expect(await screen.findByText(STATUS_LABELS[status])).toBeInTheDocument();
    },
  );

  it('ArticleHealthChecklist e ArticleTransitionPanel continuam montados exatamente uma vez cada dentro do painel', async () => {
    mockFetch();
    renderPanel('PENDING_REVIEW');

    expect(await screen.findAllByRole('heading', { name: HEALTH_FRAMING_BY_STATUS.PENDING_REVIEW })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Publicar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Voltar para rascunho' })).toHaveLength(1);
  });

  it('ação de transição já existente continua acessível e funcional a partir do painel (sem novo GET /:id)', async () => {
    const user = userEvent.setup();
    const onTransition = jest.fn();
    mockFetch({ transition: () => jsonResponse(200, makeArticle({ status: 'PUBLISHED' })) });
    renderPanel('PENDING_REVIEW', onTransition);

    await user.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(onTransition).toHaveBeenCalledWith(expect.objectContaining({ status: 'PUBLISHED' }));
  });

  it('VIEWER: nenhum botão de transição aparece, mas painel/heading/badge/checklist continuam presentes', async () => {
    mockFetch();
    renderPanel('DRAFT', jest.fn(), 'VIEWER');

    expect(screen.getByRole('complementary', { name: 'Status do Artigo' })).toBeInTheDocument();
    expect(await screen.findByText(STATUS_LABELS.DRAFT)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: HEALTH_FRAMING_BY_STATUS.DRAFT })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each<ArticleStatus>(['DRAFT', 'ARCHIVED'])('jest-axe: nenhuma violação para status %s', async (status) => {
    mockFetch();
    const { container } = renderPanel(status);

    await screen.findByText(STATUS_LABELS[status]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
