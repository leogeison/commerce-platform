import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';
import {
  ARTICLE_ID,
  SITE_ID,
  SITE_SLUG,
  articleFixture,
  mockArticleDetail,
  mockEmptyCategoriesAndAuthors,
  mockMe,
  paginatedEnvelope,
} from './fixtures';

/**
 * UXE-009A — fixture compartilhada pelos dois specs do Preview do Artigo
 * neste harness: `article-preview.a11y.spec.ts` (semântica real + axe) e
 * `article-preview-presentation.spec.ts` (estilos calculados + reflow).
 * Mesma disciplina de `fixtures.ts`: tudo via `page.route()`, nunca
 * backend/DB real; `fixtures.ts` é só importado, não modificado.
 *
 * O `bodyMdx` cobre os elementos que a UXE-009A estiliza: H1 do corpo
 * (remapeado para H2), H2–H6, parágrafo com link, lista não ordenada e
 * ordenada, lista "loose" (forma de conteúdo legado), citação, bloco
 * `:::product` (gramática v1 do Editorial Serialization Contract) e imagem.
 * A imagem aponta para uma origem fictícia servida por `page.route()` como
 * SVG de 800×400 — largura intrínseca maior que 320px, para o reflow ser
 * verificável.
 */

export const PREVIEW_PRODUCT_ID = '30000000-0000-4000-8000-000000000020';
export const PREVIEW_PRODUCT_NAME = 'Fone Bluetooth Pro';
const PREVIEW_IMAGE_ORIGIN = 'https://imagens.preview-uxe-009a.test';
export const PREVIEW_IMAGE_URL = `${PREVIEW_IMAGE_ORIGIN}/foto.svg`;

export const PREVIEW_BODY_MDX = [
  '# Título do corpo',
  '',
  'Parágrafo com [link do parágrafo](https://exemplo.com/a) e **negrito**.',
  '',
  'Segundo parágrafo, logo depois do primeiro.',
  '',
  '## Seção',
  '',
  '### Subseção',
  '',
  '#### Nível 4',
  '',
  '##### Nível 5',
  '',
  '###### Nível 6',
  '',
  '- item um',
  '- item dois',
  '- item três',
  '',
  '1. primeiro',
  '2. segundo',
  '',
  '- legado um',
  '',
  '- legado dois',
  '',
  '> Citação de exemplo.',
  '',
  ':::product',
  'version: 1',
  `productId: ${PREVIEW_PRODUCT_ID}`,
  ':::',
  '',
  `![Foto do produto](${PREVIEW_IMAGE_URL})`,
  '',
  'Último parágrafo.',
].join('\n');

const PREVIEW_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">' +
  '<rect width="800" height="400" fill="#888888"/></svg>';

export async function setupArticleWithPreviewContent(page: Page): Promise<void> {
  const article = articleFixture({ bodyMdx: PREVIEW_BODY_MDX });

  await mockMe(page);
  await mockEmptyCategoriesAndAuthors(page);
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/products**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        paginatedEnvelope([
          {
            id: PREVIEW_PRODUCT_ID,
            siteId: SITE_ID,
            categoryId: null,
            name: PREVIEW_PRODUCT_NAME,
            slug: 'fone-bluetooth-pro',
            description: null,
            imageUrl: null,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      ),
    });
  });
  await page.route(`${PREVIEW_IMAGE_ORIGIN}/**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PREVIEW_IMAGE_SVG });
  });
  await mockArticleDetail(page, article, [PREVIEW_PRODUCT_ID]);
}

/**
 * Abre o Artigo e o Preview, e devolve `{ region, content }`:
 * `region` é a `<section>` "Preview"; `content` é o contêiner dos blocos
 * compilados (`.previewContent`), localizado pela estrutura — pai do
 * heading "Título do corpo" — e não pelo nome de classe do CSS Module, que
 * é transformado no build de produção.
 */
export async function openArticlePreview(page: Page): Promise<{ region: Locator; content: Locator }> {
  await page.goto(`/${SITE_SLUG}/articles/${ARTICLE_ID}`);
  await page.getByRole('button', { name: 'Ver preview' }).click();

  const region = page.getByRole('region', { name: 'Preview' });
  const bodyHeading = region.getByRole('heading', { name: 'Título do corpo' });
  await expect(bodyHeading).toBeVisible();
  await expect(region.getByText(PREVIEW_PRODUCT_NAME)).toBeVisible();
  await expect(region.getByRole('img', { name: 'Foto do produto' })).toBeVisible();

  return { region, content: bodyHeading.locator('xpath=..') };
}
