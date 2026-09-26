import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from './mock-api-origin';

/**
 * UXE-022 — baseline visual da composição COMPLETA do Editor de Artigos
 * (título/metadados, superfície de escrita, Capa, painel contextual), em
 * desktop, exigido como obrigatório pelo desenho técnico aprovado (ver
 * `docs/UX-Implementation-Backlog.md`, entrada UXE-022, "Escopo incluído").
 *
 * Reaproveita integralmente a infraestrutura já existente (UXA-020/
 * UXE-016): mesmo diretório (`e2e-visual/`), mesmo `playwright.config.ts`
 * (Chromium/Linux, build de produção real via `webServer`), mesmo
 * `mock-api-origin.ts`, mesmos scripts (`test:visual-baseline`/
 * `test:visual-baseline:update`) — nenhuma infraestrutura nova, nenhum
 * helper genérico novo.
 *
 * Deliberadamente um spec NOVO, não uma edição de `editor.visual.spec.ts`
 * (UXE-016) — aquele spec permanece escopado apenas a
 * `data-testid="article-body-field"` (título/painel/capa foram
 * deliberadamente excluídos dali); reabri-lo para cobrir a composição
 * inteira reabriria o escopo já fechado da UXE-016. O padrão de mocks
 * (`mockAdminApi`) é duplicado aqui deliberadamente, não importado —
 * mesmo princípio.
 *
 * Escopo da captura: a composição inteira da tela DRAFT/editável —
 * `page.getByTestId('article-editor-composition')` (já presente em
 * `article-detail.tsx`, mudança de marcação pré-existente, não introduzida
 * nesta rodada) — nunca `fullPage`.
 *
 * Cobertura responsiva determinística (avaliada como viável sem
 * fragilidade relevante pela investigação desta tarefa — ver working note
 * do Projeto): três larguras fixas via `page.setViewportSize()` dentro do
 * mesmo projeto Chromium/Linux já existente, reaproveitando o mesmo
 * mock/locator/asserção de visibilidade já estável — desktop (>=1024px,
 * grid de duas colunas), intermediário (~1060px, ainda grid de duas
 * colunas com quebra parcial da toolbar) e mobile (390px, coluna única,
 * painel sempre visível no fluxo vertical — UXE-013 preserva o drawer
 * mobile do painel, este teste captura o estado já expandido/inline, não
 * o drawer fechado/aberto em si, fora do escopo desta captura).
 */

const SITE_ID = '10000000-0000-4000-8000-000000000001';
const SITE_SLUG = 'fastcompre';
const SITE_NAME = 'FastCompre';
const USER_ID = '10000000-0000-4000-8000-000000000002';
const ARTICLE_ID = '20000000-0000-4000-8000-000000000011';

const ME_RESPONSE = {
  user: { id: USER_ID, email: 'equipe.editorial@fastcompre.test', name: 'Equipe Editorial' },
  sites: [{ siteId: SITE_ID, siteSlug: SITE_SLUG, siteName: SITE_NAME, role: 'OWNER' }],
};

function paginatedEnvelope<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
}

const COMPOSITION_BODY_MDX = [
  '# Guia rápido de escolha',
  '',
  'Um parágrafo com **negrito** e *itálico*, além de um [link de referência](https://example.com/guia).',
  '',
  '- Autonomia de bateria',
  '- Conforto no uso prolongado',
  '',
  '> Priorize modelos com cancelamento de ruído ativo.',
].join('\n');

function articleFixture() {
  return {
    id: ARTICLE_ID,
    siteId: SITE_ID,
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: 'Melhores fones de ouvido bluetooth de 2026',
    slug: 'melhores-fones-bluetooth-2026',
    metaDescription: 'Comparativo dos melhores fones bluetooth custo-benefício de 2026.',
    coverImageUrl: null,
    bodyMdx: COMPOSITION_BODY_MDX,
    publishedAt: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-10T14:30:00.000Z',
  };
}

const HEALTH_RESPONSE = {
  categoryActive: true,
  hasAtLeastOneProduct: false,
  allProductsHaveValidOffer: true,
  invalidProducts: [],
  slugUnique: true,
  metaDescriptionFilled: true,
  coverImagePresent: false,
  healthy: false,
};

/**
 * Mesmos sete endpoints documentados em `editor.visual.spec.ts`
 * (UXE-016) — a composição completa (`ArticleForm` + `ArticleContextPanel`
 * dentro de `article-editor-composition`) dispara exatamente o mesmo
 * conjunto de requisições ao montar, nenhuma a mais/a menos.
 */
async function mockAdminApi(page: Page) {
  await page.route(`${MOCK_API_ORIGIN}/admin/auth/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_RESPONSE) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/products`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ productIds: [] }) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/health`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_RESPONSE) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(articleFixture()) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/products**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/categories**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/authors**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });
}

test.describe('Editor — baseline visual de composição completa (UXE-022)', () => {
  test('composição completa do Editor em desktop (>=1024px)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const composition = page.getByTestId('article-editor-composition');
    await expect(composition.getByRole('heading', { name: 'Guia rápido de escolha' })).toBeVisible();

    await expect(composition).toHaveScreenshot('editor-composition-desktop.png');
  });

  test('composição completa do Editor em viewport intermediário (~1060px)', async ({ page }) => {
    await page.setViewportSize({ width: 1060, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const composition = page.getByTestId('article-editor-composition');
    await expect(composition.getByRole('heading', { name: 'Guia rápido de escolha' })).toBeVisible();

    await expect(composition).toHaveScreenshot('editor-composition-tablet.png');
  });

  test('composição completa do Editor em mobile (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const composition = page.getByTestId('article-editor-composition');
    await expect(composition.getByRole('heading', { name: 'Guia rápido de escolha' })).toBeVisible();

    await expect(composition).toHaveScreenshot('editor-composition-mobile.png');
  });
});
