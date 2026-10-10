import type { Page, Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';

/**
 * UXQ-002 — fixtures/mocks locais a `apps/admin/e2e-a11y/`, usados pelos
 * três cenários (login, criar/editar Artigo, publicar Artigo).
 *
 * Reaproveita, por NOVA declaração (nunca import cruzado de `e2e-visual/`,
 * que permanece intocado), os formatos de endpoint já validados em
 * `apps/admin/e2e-visual/editor.visual.spec.ts` e
 * `apps/admin/e2e-visual/dashboard.visual.spec.ts` — confirmados por
 * leitura direta de `authenticated-shell.tsx`, `home.tsx`, `dashboard.tsx`,
 * `login-form.tsx`, `article-detail.tsx`, `create-article.tsx`,
 * `article-form.tsx`, `article-transition-panel.tsx` e
 * `packages/contracts/src/common/api-error.ts`. Só `MOCK_API_ORIGIN`
 * (`../e2e-visual/mock-api-origin.ts`) é importado somente-leitura, mesma
 * prática já em uso desde a UXQ-001 pelo `playwright.config.ts` deste
 * diretório.
 *
 * Sessão sempre mockada com Role `OWNER` (mesmo critério de
 * `editor.visual.spec.ts`/`dashboard.visual.spec.ts`) — suficiente para
 * atravessar os três fluxos cobertos pela UXQ-002. Nenhum teste de matriz
 * de Role, tenancy ou isolamento de Site é feito aqui: nenhum guard,
 * contrato ou regra de autorização real é exercitado — é sempre uma
 * resposta mockada no front-end, nunca uma sessão real.
 */

export const SITE_ID = '10000000-0000-4000-8000-000000000001';
export const SITE_SLUG = 'fastcompre';
export const SITE_NAME = 'FastCompre';
export const USER_ID = '10000000-0000-4000-8000-000000000002';
export const ARTICLE_ID = '20000000-0000-4000-8000-000000000010';

export const ME_RESPONSE = {
  user: { id: USER_ID, email: 'equipe.editorial@fastcompre.test', name: 'Equipe Editorial' },
  sites: [{ siteId: SITE_ID, siteSlug: SITE_SLUG, siteName: SITE_NAME, role: 'OWNER' as const }],
};

export function paginatedEnvelope<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
}

/**
 * Envelope vazio de `listArticlesResponseSchema` — usado pelas três
 * seções do Dashboard (UXA-017/018) no ponto de axe "landing autenticado"
 * do cenário de Login. Estado vazio é suficiente para essa prova: nenhum
 * dado de Artigo é exigido pelo cenário de Login em si (criar/editar/
 * publicar Artigo são os outros dois cenários, cada um com seu próprio
 * `articleFixture`).
 */
export function emptyArticleListEnvelope() {
  return { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 };
}

export const HEALTH_RESPONSE = {
  categoryActive: true,
  hasAtLeastOneProduct: false,
  allProductsHaveValidOffer: true,
  invalidProducts: [],
  slugUnique: true,
  metaDescriptionFilled: false,
  coverImagePresent: false,
  healthy: false,
};

interface ArticleFixtureOverrides {
  status?: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  title?: string;
  slug?: string;
  bodyMdx?: string;
  publishedAt?: string | null;
}

/**
 * `articleAdminSchema` completo. `categoryId`/`authorId`/
 * `metaDescription`/`coverImageUrl` sempre `null` — nenhum dos três
 * cenários da UXQ-002 depende de Categoria/Autor/capa preenchidos
 * (confirmado: `createArticleRequestSchema` só exige
 * `type`/`title`/`slug`; preenchê-los seria cobertura adicional por
 * conveniência, fora do pedido).
 */
export function articleFixture(overrides: ArticleFixtureOverrides = {}) {
  return {
    id: ARTICLE_ID,
    siteId: SITE_ID,
    categoryId: null,
    authorId: null,
    type: 'REVIEW' as const,
    status: overrides.status ?? 'DRAFT',
    title: overrides.title ?? 'Melhores fones de ouvido bluetooth de 2026',
    slug: overrides.slug ?? 'melhores-fones-bluetooth-2026',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx: overrides.bodyMdx ?? '',
    publishedAt: overrides.publishedAt ?? null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-10T14:30:00.000Z',
  };
}

export type ArticleFixtureValue = ReturnType<typeof articleFixture>;

/**
 * `GET /admin/auth/me` — consumido independentemente por `home.tsx`,
 * `authenticated-shell.tsx` e `topbar.tsx` (ADM-003/UXA-006 e afins); um
 * único `page.route()` serve às três chamadas, exatamente como já
 * documentado em `editor.visual.spec.ts`/`dashboard.visual.spec.ts`.
 */
export async function mockMe(page: Page) {
  await page.route(`${MOCK_API_ORIGIN}/admin/auth/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_RESPONSE) });
  });
}

/**
 * `POST /admin/auth/login` — só o cenário de Login usa este mock.
 * `outcome: 'invalid-credentials'` replica o formato real de erro
 * (`apiErrorSchema`, `packages/contracts/src/common/api-error.ts`) com
 * `statusCode: 401`/`message: 'Credenciais inválidas.'` — a mesma
 * mensagem genérica que `AuthController.login` sempre devolve (nunca
 * distingue e-mail de senha), repassada tal qual por
 * `resolveErrorMessage` em `login-form.tsx`.
 */
export async function mockLogin(page: Page, outcome: 'success' | 'invalid-credentials') {
  await page.route(`${MOCK_API_ORIGIN}/admin/auth/login`, async (route: Route) => {
    if (outcome === 'invalid-credentials') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          error: 'Unauthorized',
          message: 'Credenciais inválidas.',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: USER_ID, email: 'equipe.editorial@fastcompre.test', name: 'Equipe Editorial' },
      }),
    });
  });
}

/**
 * `GET /admin/sites/:siteSlug/articles**` — as três seções do Dashboard
 * (UXA-017/018), sempre vazias. Só o ponto de axe "landing autenticado"
 * do cenário de Login usa este mock.
 */
export async function mockEmptyDashboardSections(page: Page) {
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyArticleListEnvelope()),
    });
  });
}

/**
 * `GET /admin/sites/:siteSlug/categories**` e `.../authors**` — vazios.
 * `ArticleForm` busca os dois tanto em `/articles/new` quanto em
 * `/articles/:id` (confirmado em `article-form.tsx`), então os cenários
 * de criar/editar e publicar Artigo usam este mock.
 */
export async function mockEmptyCategoriesAndAuthors(page: Page) {
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/categories**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/authors**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });
}

/**
 * `GET /admin/sites/:siteSlug/products**` — catálogo vazio.
 * `ProductLookupProvider`/`ArticleHealthChecklist` buscam em
 * `/articles/:id` (nunca em `/articles/new`, onde `articleId: null`
 * mantém o Provider em `unavailable` sem disparar busca — confirmado no
 * doc comment de `create-article.tsx`).
 */
export async function mockEmptyProductCatalog(page: Page) {
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/products**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });
}

/**
 * `POST /admin/sites/:siteSlug/articles` — criação mockada
 * (`create-article.tsx`). Resposta fixa e realista (shape real de
 * `articleAdminSchema`, nunca refletindo os valores digitados no
 * formulário) — só o cenário de criar/editar Artigo usa este mock.
 */
export async function mockCreateArticle(page: Page, createdArticle: ArticleFixtureValue) {
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles`, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(createdArticle) });
  });
}

/**
 * `GET /admin/sites/:siteSlug/articles/:id` (o próprio Artigo),
 * `.../articles/:id/products` (vínculo de Produtos) e
 * `.../articles/:id/health` — registrados juntos porque sempre
 * acompanham a mesma composição de `/articles/:id`
 * (`article-detail.tsx`). Mesma ordem de registro de
 * `editor.visual.spec.ts` (padrões mais específicos antes do padrão
 * exato de `/articles/:id`, só por legibilidade — não afeta a resolução).
 */
export async function mockArticleDetail(page: Page, article: ArticleFixtureValue, linkedProductIds: string[] = []) {
  await page.route(
    `${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${article.id}/products`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ productIds: linkedProductIds }),
      });
    },
  );

  await page.route(
    `${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${article.id}/health`,
    async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_RESPONSE) });
    },
  );

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${article.id}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(article) });
  });
}

/**
 * `POST /admin/sites/:siteSlug/articles/:id/publish` — transição mockada
 * (`article-transition-panel.tsx`, `transitionPath`). Resposta fixa e
 * realista: o mesmo Artigo, só com `status: 'PUBLISHED'` e `publishedAt`
 * preenchido — o front-end nunca calcula o próximo estado por conta
 * própria (`handleTransition` em `article-detail.tsx` só substitui
 * `state.article` pelo que a API devolveu), então mockar esta ÚNICA
 * resposta real é fidelidade à máquina de estados, não simulação. Só o
 * cenário de publicar Artigo usa este mock.
 */
export async function mockPublishTransition(page: Page, publishedArticle: ArticleFixtureValue) {
  await page.route(
    `${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${publishedArticle.id}/publish`,
    async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publishedArticle) });
    },
  );
}
