import { expect, test, type Page } from '@playwright/test';
import { resetFixtureState } from '../e2e-visual/fixture-state-control';
import { ARTICLE_SLUG, CATEGORY_SLUG, PRODUCT_NAME } from '../e2e-visual/fixtures.mjs';

/**
 * UXP-001 — asserts programáticos de apresentação do card público de
 * Produto/Ofertas (bloco inline `:::product`), em browser real contra o
 * build de produção (mesmo harness/mock da UXQ-001, reutilizado só para
 * leitura). Arquivo próprio, separado dos specs de axe — convenção do
 * projeto: `e2e-visual/` é exclusivo de screenshots; asserts programáticos
 * de apresentação ficam em `e2e-a11y/`.
 *
 * Prova, nas larguras em que o defeito foi observado em produção:
 * - a imagem do Produto permanece um quadrado de 96×96 (antes esticava até
 *   a altura do texto ao lado — 96×420 a 360px, 96×504 a 320px);
 * - sem overflow horizontal da página a 320px (reflow, WCAG 1.4.10);
 * - no mobile, a imagem fica centralizada horizontalmente no card, e
 *   descrição/Ofertas ocupam a largura total do card abaixo dela;
 * - em `sm`+, composição lateral em toda a largura do card: imagem 176×176
 *   centralizada na própria coluna, linha divisória, nome em negrito e
 *   Ofertas lado a lado em colunas iguais;
 * - CTA com largura consistente entre si, alvo de toque confortável e preço
 *   numa única linha.
 *
 * Nada aqui clica em CTA nem navega para `/r/` — só mede o DOM renderizado.
 */

const IMAGE_SIZE_PX = 96;
// `sm:h-44 sm:w-44` — imagem maior só em `sm`+ (mobile permanece 96).
const DESKTOP_IMAGE_SIZE_PX = 176;
// `sm:grid-cols-[11rem_minmax(0,1fr)]` — coluna reservada à imagem em `sm`+.
const DESKTOP_IMAGE_COLUMN_PX = 176;
// WCAG 2.5.8 (AA) exige ≥24px; o CTA do projeto usa o padding de controle
// padrão, e esta correção não pode deixá-lo abaixo do tamanho já existente
// em uma linha (~48px) — 44px é o piso usado aqui como alvo confortável.
const MIN_CTA_HEIGHT_PX = 44;

async function openArticle(page: Page, width: number): Promise<void> {
  await resetFixtureState('populated');
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/${CATEGORY_SLUG}/${ARTICLE_SLUG}`);
  await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
}

function productCard(page: Page) {
  // Nome do Produto (`<p>`) → grid → card (`product-block.tsx`).
  return page.getByText(PRODUCT_NAME).locator('xpath=../..');
}

function productCardGrid(page: Page) {
  return page.getByText(PRODUCT_NAME).locator('xpath=..');
}

// Tolerância de 1px para arredondamento subpixel.
const CENTERING_TOLERANCE_PX = 1;
// Peso de `sm:font-semibold`.
const DESKTOP_NAME_FONT_WEIGHT = '600';

test.describe('FastCompre — card de Produto/Ofertas (UXP-001)', () => {
  for (const width of [320, 360]) {
    test(`mobile ${width}px: imagem quadrada e centralizada, sem overflow horizontal, detalhes em largura total`, async ({ page }) => {
      await openArticle(page, width);
      const card = productCard(page);
      const image = card.locator('img');
      await expect(image).toBeVisible();

      const imageBox = await image.boundingBox();
      expect(imageBox).not.toBeNull();
      expect(Math.round(imageBox!.width)).toBe(IMAGE_SIZE_PX);
      expect(Math.round(imageBox!.height)).toBe(IMAGE_SIZE_PX);
      expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // Imagem centralizada horizontalmente na área interna do card (grid).
      const gridBox = await productCardGrid(page).boundingBox();
      expect(gridBox).not.toBeNull();
      const imageCenter = imageBox!.x + imageBox!.width / 2;
      const gridCenter = gridBox!.x + gridBox!.width / 2;
      expect(Math.abs(imageCenter - gridCenter)).toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);

      // Nome e detalhes (descrição + Ofertas) abaixo da imagem, em largura
      // total da área interna do card — não uma coluna ao lado da imagem.
      const nameBox = await page.getByText(PRODUCT_NAME).boundingBox();
      expect(nameBox).not.toBeNull();
      expect(nameBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
      expect(Math.round(nameBox!.x)).toBe(Math.round(gridBox!.x));
      const offerList = card.locator('ul');
      const offerListBox = await offerList.boundingBox();
      expect(offerListBox).not.toBeNull();
      expect(offerListBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
      expect(Math.round(offerListBox!.x)).toBe(Math.round(gridBox!.x));
      expect(Math.round(offerListBox!.width)).toBe(Math.round(gridBox!.width));

      const cta = card.getByRole('link');
      const ctaBox = await cta.first().boundingBox();
      expect(ctaBox).not.toBeNull();
      expect(ctaBox!.height).toBeGreaterThanOrEqual(MIN_CTA_HEIGHT_PX);
      // CTA em largura total da lista no mobile.
      expect(Math.round(ctaBox!.width)).toBe(Math.round(offerListBox!.width));

      // Preço numa única linha (nunca "R$" separado do valor).
      const price = cta.first().locator('.tabular-nums');
      const priceLines = await price.evaluate((element) => {
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
        return Math.round(element.getBoundingClientRect().height / lineHeight);
      });
      expect(priceLines).toBe(1);
    });
  }

  test('desktop 1440px: imagem 176×176 centralizada na própria coluna, linha divisória, nome em negrito, Ofertas lado a lado', async ({ page }) => {
    await openArticle(page, 1440);
    const card = productCard(page);
    const grid = productCardGrid(page);
    const name = page.getByText(PRODUCT_NAME);
    const image = card.locator('img');
    const offerList = card.locator('ul');

    const imageBox = await image.boundingBox();
    const gridBox = await grid.boundingBox();
    const nameBox = await name.boundingBox();
    const offerListBox = await offerList.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    expect(offerListBox).not.toBeNull();

    // Imagem 176×176, sem recorte.
    expect(Math.round(imageBox!.width)).toBe(DESKTOP_IMAGE_SIZE_PX);
    expect(Math.round(imageBox!.height)).toBe(DESKTOP_IMAGE_SIZE_PX);
    expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');

    // Centralizada na coluna reservada a ela: na horizontal (os primeiros
    // 11rem do grid) e na vertical (altura total do grid).
    const imageCenterX = imageBox!.x + imageBox!.width / 2;
    expect(Math.abs(imageCenterX - (gridBox!.x + DESKTOP_IMAGE_COLUMN_PX / 2))).toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);
    const imageCenterY = imageBox!.y + imageBox!.height / 2;
    expect(Math.abs(imageCenterY - (gridBox!.y + gridBox!.height / 2))).toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);

    // Grid em toda a largura interna do card (sem `max-w`/centralização do
    // conjunto): mesma largura da área de conteúdo do card.
    const cardContentWidth = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
    expect(Math.round(gridBox!.width)).toBe(Math.round(cardContentWidth));

    // Conteúdo à direita da coluna da imagem; nome à esquerda, começando no
    // mesmo x do bloco de detalhes (os dois itens da coluna de conteúdo — as
    // Ofertas ficam dentro do bloco de detalhes, com o mesmo recuo do texto
    // do nome), em negrito.
    expect(nameBox!.x).toBeGreaterThanOrEqual(gridBox!.x + DESKTOP_IMAGE_COLUMN_PX);
    const detailsBox = await name.locator('xpath=following-sibling::*[1]').boundingBox();
    expect(detailsBox).not.toBeNull();
    expect(Math.round(nameBox!.x)).toBe(Math.round(detailsBox!.x));
    expect(offerListBox!.x).toBeGreaterThan(nameBox!.x);
    expect(await name.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(DESKTOP_NAME_FONT_WEIGHT);

    // Linha divisória vertical contínua entre imagem e conteúdo (nome +
    // detalhes), visível (largura > 0, estilo sólido).
    const dividers = await name.evaluate((element) =>
      [element, element.nextElementSibling as HTMLElement].map((item) => {
        const style = getComputedStyle(item);
        return { width: style.borderLeftWidth, style: style.borderLeftStyle };
      }),
    );
    for (const divider of dividers) {
      expect(divider.width).toBe('1px');
      expect(divider.style).toBe('solid');
    }

    // Ofertas lado a lado: a grade resolve em 2 colunas de mesma largura
    // nesta largura (a fixture tem uma Oferta; a segunda ocuparia a coluna
    // ao lado), e o CTA ocupa exatamente uma coluna, numa única linha.
    const columns = await offerList.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').map((value) => parseFloat(value)),
    );
    expect(columns).toHaveLength(2);
    expect(Math.abs(columns[0] - columns[1])).toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);
    const ctaBox = await card.getByRole('link').first().boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(Math.abs(ctaBox!.width - columns[0])).toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);
    expect(ctaBox!.height).toBeGreaterThanOrEqual(MIN_CTA_HEIGHT_PX);

    // Traço entre marketplace e preço nunca visível (só `sr-only`).
    const visibleCtaText = await card.getByRole('link').first().evaluate((element) =>
      Array.from(element.children)
        .filter((child) => !child.classList.contains('sr-only'))
        .map((child) => child.textContent)
        .join(' '),
    );
    expect(visibleCtaText).not.toContain('—');
  });
});
