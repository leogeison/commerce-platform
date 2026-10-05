import { expect, test } from '@playwright/test';
import { ARTICLE_TITLE, AUTHOR_NAME, CATEGORY_SLUG, ARTICLE_SLUG, PRODUCT_NAME } from './fixtures.mjs';
import { resetFixtureState } from './fixture-state-control';
import { waitForFontsReady, waitForImageLoaded } from './wait-for-stable';

/**
 * UXW-015 — baseline visual do Artigo (`/:categorySlug/:articleSlug`),
 * único estado exigido (populado — Artigo é singular, não tem "vazio",
 * item 2 do desenho técnico aprovado).
 *
 * Navega direto para a URL canônica (`categorySlug` real do fixture) —
 * nunca dispara o redirect 308 de `article.categorySlug !== categorySlug`
 * (Architecture.md §33), que não é o que esta captura quer exercitar.
 *
 * Fixture mínima (ver `fixtures.mjs`): título, data fixa, Autor com
 * avatar, corpo editorial real (heading + parágrafo), exatamente um
 * `:::product` resolvido pelo mesmo payload — o compilador MDX real roda
 * durante o `next build`/`next start` (nunca mockado), então este teste
 * também prova, de forma incidental, que o pipeline editorial real
 * continua funcionando — sem reabrir escopo de resize/dimensões (UXE-022).
 */
test.describe('FastCompre — Artigo (UXW-015)', () => {
  test('estado populado: título, byline, corpo editorial e bloco Produto/Oferta', async ({ page }) => {
    await resetFixtureState('populated');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${CATEGORY_SLUG}/${ARTICLE_SLUG}`);

    await expect(page.getByRole('heading', { level: 1, name: ARTICLE_TITLE })).toBeVisible();
    await expect(page.getByText(AUTHOR_NAME)).toBeVisible();
    // Prova de que o bloco `:::product` foi resolvido contra o payload real
    // (nunca o `productId` cru, nunca "Carregando…") — mesmo critério já
    // usado em `editor.visual.spec.ts` (UXE-016) do lado Admin.
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible();

    // Avatar do Autor — `alt=""` é decorativo por desenho (nome do Autor
    // já visível ao lado, ver `page.tsx`): o próprio Playwright computa
    // role="presentation" (nunca "img") para `<img alt="">` sem
    // title/aria-*/tabindex (confirmado em `playwright-core/lib/
    // coreBundle.js`: `"IMG": (e) => e.getAttribute("alt") === "" && ...
    // ? "presentation" : "img"`) — `getByRole('img', {name:''})` nunca
    // encontraria este elemento, com qualquer timeout. Localizado via
    // irmão estrutural (nome do Autor, já afirmado visível acima) +
    // `xpath=..` até o container comum — mesmo critério já usado abaixo
    // para a imagem do Produto, nunca um índice posicional frágil.
    const avatar = page.getByText(AUTHOR_NAME).locator('xpath=..').locator('img');
    await waitForImageLoaded(avatar);
    // Imagem do `ProductBlock` — mesmo `<div className="flex gap-4">` que
    // envolve a imagem E o `<p>` com `product.name` como irmãos diretos
    // (`product-block.tsx`, `ProductBlockFound`) — `xpath=../..` sobe do
    // `<p>` (via `<div className="min-w-0">`) até esse container comum,
    // nunca um índice posicional frágil como "a última imagem da página".
    const productImage = page.getByText(PRODUCT_NAME).locator('xpath=../..').locator('img');
    await waitForImageLoaded(productImage);
    await waitForFontsReady(page);

    await expect(page).toHaveScreenshot('article-populated.png', { fullPage: true });
  });
});
