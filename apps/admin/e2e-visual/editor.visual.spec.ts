import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from './mock-api-origin';

/**
 * UXE-016 — Gate de fechamento UX-M03 (lado Admin): baseline visual do
 * Editor de corpo do Artigo (`ArticleBodyEditor`, dentro de `ArticleForm`).
 *
 * Reaproveita integralmente a infraestrutura da UXA-020: mesmo diretório
 * (`e2e-visual/`), mesmo `playwright.config.ts` (Chromium/Linux, build de
 * produção real via `webServer`), mesmo `mock-api-origin.ts`, mesmos
 * scripts (`test:visual-baseline`/`test:visual-baseline:update`) — nenhuma
 * infraestrutura nova, nenhum helper genérico novo.
 *
 * Escopo da captura: só a superfície do campo "Corpo (Markdown)" —
 * `page.getByTestId('article-body-field')`, nunca `fullPage` e nunca
 * `.locator('..')` dependente de estrutura incidental do DOM. O
 * `data-testid="article-body-field"` foi adicionado ao `<div
 * className={styles.field}>` que envolve label → `ArticleBodyEditor` →
 * indicador de autosave → `ArticlePreview` em `article-form.tsx` — nenhuma
 * outra região (título, SEO, `ArticleContextPanel`, capa, submit) entra no
 * baseline desta tarefa.
 *
 * Três estados conceituais, cada um sua própria composição React
 * (`/:siteSlug/articles/:id`, sempre `status: 'DRAFT'` + Role `OWNER`, para
 * cair na composição editável de `ArticleDetail`):
 * 1. vazio (`bodyMdx: ''`);
 * 2. conteúdo textual/rico (heading, negrito, itálico, link, lista,
 *    citação) — sem imagem: a UXE-015 já cobre funcionalmente o bloco de
 *    imagem, e nenhuma exigência normativa da UXE-016 pede imagem neste
 *    baseline, então nenhuma fixture binária/rede extra foi adicionada;
 * 3. bloco Produto/Oferta — `bodyMdx` contém SOMENTE `productId` dentro de
 *    `:::product` (gramática v1 de `product-block/grammar.ts`,
 *    `serializeProductBlock`), nunca nome/preço/imagem do Produto: os dados
 *    visuais são resolvidos em runtime por `ProductLookupContext` contra o
 *    catálogo mockado abaixo (`GET .../products`) e a lista de vínculo
 *    (`GET .../articles/:id/products`) — preserva o Editorial Serialization
 *    Contract (bodyMdx nunca é uma segunda fonte de dados de Produto).
 *
 * `page.emulateMedia({ reducedMotion: 'reduce' })` em todos os três testes
 * (decisão desta rodada, só neste spec — nenhuma alteração em
 * `playwright.config.ts` nem nos baselines da UXA-020).
 *
 * Mocks: só os endpoints que a composição real de `/:siteSlug/articles/:id`
 * (status DRAFT, Role OWNER) efetivamente dispara ao montar — confirmado
 * lendo `article-detail.tsx`, `article-form.tsx`, `product-lookup-context.tsx`
 * e `article-health-checklist.tsx`, não copiado do conjunto de mocks do
 * Jest:
 * - `GET /admin/auth/me` (sessão, `AuthenticatedShell`);
 * - `GET /admin/sites/:siteSlug/articles/:id` (o próprio Artigo);
 * - `GET /admin/sites/:siteSlug/articles/:id/products` (`ProductLookupProvider`);
 * - `GET /admin/sites/:siteSlug/products` (catálogo — `ProductLookupProvider`
 *   E `ArticleHealthChecklist`, duas buscas independentes do MESMO endpoint);
 * - `GET /admin/sites/:siteSlug/categories` (`ArticleForm`);
 * - `GET /admin/sites/:siteSlug/authors` (`ArticleForm`);
 * - `GET /admin/sites/:siteSlug/articles/:id/health` (`ArticleHealthChecklist`).
 * Nenhum mock de mutação (`PATCH`/`POST`) — nenhum dos três testes submete
 * o formulário nem aciona transição/upload.
 */

const SITE_ID = '10000000-0000-4000-8000-000000000001';
const SITE_SLUG = 'fastcompre';
const SITE_NAME = 'FastCompre';
const USER_ID = '10000000-0000-4000-8000-000000000002';
const ARTICLE_ID = '20000000-0000-4000-8000-000000000010';
const PRODUCT_ID = '30000000-0000-4000-8000-000000000001';

const ME_RESPONSE = {
  user: { id: USER_ID, email: 'equipe.editorial@fastcompre.test', name: 'Equipe Editorial' },
  sites: [{ siteId: SITE_ID, siteSlug: SITE_SLUG, siteName: SITE_NAME, role: 'OWNER' }],
};

function paginatedEnvelope<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
}

function articleFixture(bodyMdx: string) {
  return {
    id: ARTICLE_ID,
    siteId: SITE_ID,
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: 'Melhores fones de ouvido bluetooth de 2026',
    slug: 'melhores-fones-bluetooth-2026',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx,
    publishedAt: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-10T14:30:00.000Z',
  };
}

const PRODUCT_FIXTURE = {
  id: PRODUCT_ID,
  siteId: SITE_ID,
  categoryId: null,
  name: 'Fone Bluetooth XY-200',
  slug: 'fone-bluetooth-xy-200',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const HEALTH_RESPONSE = {
  categoryActive: true,
  hasAtLeastOneProduct: true,
  allProductsHaveValidOffer: true,
  invalidProducts: [],
  slugUnique: true,
  metaDescriptionFilled: false,
  coverImagePresent: false,
  healthy: false,
};

const RICH_CONTENT_BODY_MDX = [
  '# Guia rápido de escolha',
  '',
  'Um parágrafo com **negrito** e *itálico*, além de um [link de referência](https://example.com/guia).',
  '',
  '- Autonomia de bateria',
  '- Conforto no uso prolongado',
  '',
  '> Priorize modelos com cancelamento de ruído ativo.',
].join('\n');

const PRODUCT_BLOCK_BODY_MDX = [
  'Confira abaixo a nossa recomendação principal.',
  '',
  ':::product',
  'version: 1',
  `productId: ${PRODUCT_ID}`,
  ':::',
  '',
  'Ele se destaca pela autonomia de bateria.',
].join('\n');

/**
 * Registra, antes de qualquer `page.goto()`, só os sete endpoints que a
 * composição DRAFT/editável de `/:siteSlug/articles/:id` efetivamente
 * requisita (ver doc comment do arquivo) — `linkedProductIds` varia por
 * teste (vazio nos dois primeiros estados, `[PRODUCT_ID]` no terceiro).
 */
async function mockAdminApi(page: Page, bodyMdx: string, linkedProductIds: string[]) {
  await page.route(`${MOCK_API_ORIGIN}/admin/auth/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_RESPONSE) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/products`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ productIds: linkedProductIds }),
    });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/health`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_RESPONSE) });
  });

  // Registrado ANTES do padrão exato de `/articles/:id` abaixo: o Playwright
  // resolve pelo padrão mais recentemente registrado primeiro, então a
  // ordem aqui não importa para a correção (nenhum dos dois padrões é
  // prefixo do outro sem o `/products`/`/health` já capturados acima por
  // padrões mais específicos) — mantido nesta posição só por legibilidade.
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(articleFixture(bodyMdx)) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/products**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(paginatedEnvelope([PRODUCT_FIXTURE])),
    });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/categories**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });

  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/authors**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });
}

test.describe('Editor — baseline visual (UXE-016)', () => {
  test('estado vazio: bodyMdx sem conteúdo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page, '', []);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const bodyField = page.getByTestId('article-body-field');
    await expect(bodyField.getByRole('textbox', { name: 'Corpo (Markdown)' })).toBeVisible();

    await expect(bodyField).toHaveScreenshot('editor-empty.png');
  });

  test('estado com conteúdo: texto rico (heading, negrito, itálico, link, lista, citação)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page, RICH_CONTENT_BODY_MDX, []);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const bodyField = page.getByTestId('article-body-field');
    await expect(bodyField.getByRole('heading', { name: 'Guia rápido de escolha' })).toBeVisible();

    await expect(bodyField).toHaveScreenshot('editor-content.png');
  });

  test('estado com bloco Produto/Oferta: bodyMdx só com productId, dados resolvidos pelo catálogo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page, PRODUCT_BLOCK_BODY_MDX, [PRODUCT_ID]);
    await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);

    const bodyField = page.getByTestId('article-body-field');
    // Espera a resolução real do bloco contra o catálogo mockado (nunca o
    // productId cru, nunca "Carregando...") — prova de que o bloco nunca
    // carrega nome/preço embutidos no próprio bodyMdx.
    await expect(bodyField.getByText(PRODUCT_FIXTURE.name)).toBeVisible();

    await expect(bodyField).toHaveScreenshot('editor-product-block.png');
  });
});
