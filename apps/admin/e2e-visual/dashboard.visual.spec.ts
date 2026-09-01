import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from './mock-api-origin';

/**
 * UXA-020 — captura do baseline visual do Dashboard (`/:siteSlug`).
 *
 * Sem API/Postgres/sessão reais: `page.route()` intercepta as únicas duas
 * chamadas que o Dashboard autenticado faz (`GET /admin/auth/me`, dono do
 * fetch de sessão em `AuthenticatedShell`, e `GET
 * /admin/sites/:siteSlug/articles`, uma por seção) antes de qualquer
 * navegação — mesmo princípio de isolamento já usado em
 * `dashboard.spec.tsx` (Jest mocka `global.fetch`; aqui mockamos a
 * network do browser real). Dados 100% determinísticos (UUIDs e datas
 * fixas, nenhum `Date.now()`/`crypto.randomUUID()`) — o PNG gerado nunca
 * varia entre execuções por causa do conteúdo.
 *
 * Os padrões de `page.route()` abaixo são prefixados por `MOCK_API_ORIGIN`
 * (`mock-api-origin.ts`) — a mesma constante que `playwright.config.ts`
 * usa para `NEXT_PUBLIC_API_URL` no build. Prefixo exato, não um `**`
 * cobrindo qualquer origem: garante por construção que a interceptação
 * bate com a origem que o bundle do cliente realmente chama, em vez de
 * só "funcionar" por coincidência de um `**` amplo demais.
 *
 * `SITE_SLUG`/`ROLE` fixos e idênticos nos dois testes — o único dado que
 * varia entre "populado" e "vazio" é o conteúdo das três seções de
 * Artigo. `role: 'OWNER'` (o mais alto) garante que os 4 atalhos de
 * criação apareçam nos dois baselines, para o PNG representar o Dashboard
 * completo, não um recorte por Role — a variação por Role dos atalhos já
 * está coberta por `dashboard.spec.tsx` (Testing Library), não é
 * preocupação deste baseline visual.
 */

const SITE_ID = '10000000-0000-4000-8000-000000000001';
const SITE_SLUG = 'fastcompre';
const SITE_NAME = 'FastCompre';
const USER_ID = '10000000-0000-4000-8000-000000000002';

const ME_RESPONSE = {
  user: { id: USER_ID, email: 'equipe.editorial@fastcompre.test', name: 'Equipe Editorial' },
  sites: [{ siteId: SITE_ID, siteSlug: SITE_SLUG, siteName: SITE_NAME, role: 'OWNER' }],
};

interface ArticleFixture {
  id: string;
  type: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  title: string;
  slug: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function makeArticle(overrides: Partial<ArticleFixture> & Pick<ArticleFixture, 'id' | 'status' | 'title' | 'slug'>): ArticleFixture {
  return {
    type: 'REVIEW',
    publishedAt: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    ...overrides,
  };
}

function articleEnvelope(article: ArticleFixture | null) {
  const items = article
    ? [
        {
          id: article.id,
          siteId: SITE_ID,
          categoryId: null,
          authorId: null,
          type: article.type,
          status: article.status,
          title: article.title,
          slug: article.slug,
          metaDescription: null,
          coverImageUrl: null,
          publishedAt: article.publishedAt,
          createdAt: article.createdAt,
          updatedAt: article.updatedAt,
        },
      ]
    : [];
  return { items, page: 1, pageSize: 5, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
}

const POPULATED_ARTICLES: Record<'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED', ArticleFixture> = {
  DRAFT: makeArticle({
    id: '20000000-0000-4000-8000-000000000001',
    status: 'DRAFT',
    title: 'Melhores fones de ouvido bluetooth de 2026',
    slug: 'melhores-fones-bluetooth-2026',
    updatedAt: '2026-01-10T14:30:00.000Z',
  }),
  PENDING_REVIEW: makeArticle({
    id: '20000000-0000-4000-8000-000000000002',
    status: 'PENDING_REVIEW',
    title: 'Guia de compra: notebooks para trabalho remoto',
    slug: 'guia-notebooks-trabalho-remoto',
    updatedAt: '2026-01-09T11:15:00.000Z',
  }),
  PUBLISHED: makeArticle({
    id: '20000000-0000-4000-8000-000000000003',
    status: 'PUBLISHED',
    title: 'Comparativo: os 5 melhores robôs aspiradores',
    slug: 'comparativo-robos-aspiradores',
    updatedAt: '2026-01-08T08:00:00.000Z',
    publishedAt: '2026-01-08T08:00:00.000Z',
  }),
};

/**
 * Registra as duas interceptações antes de qualquer `page.goto()`
 * (requisito desta rodada) — nenhuma delas depende de rede real em
 * nenhum momento.
 */
async function mockAdminApi(page: Page, articlesByStatus: Partial<Record<'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED', ArticleFixture>>) {
  await page.route(`${MOCK_API_ORIGIN}/admin/auth/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_RESPONSE) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status') as 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | null;
    const article = status ? (articlesByStatus[status] ?? null) : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(articleEnvelope(article)),
    });
  });
}

test.describe('Dashboard — baseline visual (UXA-020)', () => {
  test('estado populado: as três seções com um Artigo cada, warning amber visível em "Aguardando publicação"', async ({ page }) => {
    await mockAdminApi(page, POPULATED_ARTICLES);
    await page.goto(`/${SITE_SLUG}`);

    // Espera o conteúdo real assentar (fim do "Carregando...") antes do
    // screenshot — os três títulos fixos são prova direta de que as três
    // seções resolveram com os dados mockados.
    await expect(page.getByRole('link', { name: POPULATED_ARTICLES.DRAFT.title })).toBeVisible();
    await expect(page.getByRole('link', { name: POPULATED_ARTICLES.PENDING_REVIEW.title })).toBeVisible();
    await expect(page.getByRole('link', { name: POPULATED_ARTICLES.PUBLISHED.title })).toBeVisible();

    await expect(page).toHaveScreenshot('dashboard-populated.png', { fullPage: true });
  });

  test('estado vazio: as três seções sem itens', async ({ page }) => {
    await mockAdminApi(page, {});
    await page.goto(`/${SITE_SLUG}`);

    await expect(page.getByText('Nenhum rascunho em andamento.')).toBeVisible();
    await expect(page.getByText('Nenhum Artigo aguardando publicação.')).toBeVisible();
    await expect(page.getByText('Nenhum Artigo publicado recentemente.')).toBeVisible();

    await expect(page).toHaveScreenshot('dashboard-empty.png', { fullPage: true });
  });
});
