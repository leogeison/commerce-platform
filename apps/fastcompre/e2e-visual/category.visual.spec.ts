import { expect, test } from '@playwright/test';
import { ARTICLE_SLUG, ARTICLE_TITLE, CATEGORY_NAME, CATEGORY_SLUG } from './fixtures.mjs';
import { resetFixtureState } from './fixture-state-control';
import { waitForFontsReady, waitForImageLoaded } from './wait-for-stable';

/**
 * UXW-015 — baseline visual da Categoria (`/:categorySlug`), estados
 * populado e vazio. Mesma categoria (`CATEGORY_SLUG`) nos dois testes — ela
 * sempre existe; o que muda é só a contagem de Artigos publicados nela
 * (exatamente o que "categoria vazia" significa — nunca categoria
 * inexistente, isso é 404, fora do escopo desta tarefa).
 */
test.describe('FastCompre — Categoria (UXW-015)', () => {
  test('estado populado: um Artigo listado na categoria', async ({ page }) => {
    await resetFixtureState('populated');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${CATEGORY_SLUG}`);

    await expect(page.getByRole('heading', { level: 1, name: CATEGORY_NAME })).toBeVisible();
    // CORRIGIDO nesta rodada: o `<a>` do card ganhou `aria-labelledby`
    // apontando para o `id` do `<h2>` visível (`category-card-title-${id}`,
    // ver `[categorySlug]/page.tsx`) — mesma causa e mesma correção do
    // card de Artigo em `home.visual.spec.ts` (ver nota detalhada lá).
    const articleLink = page.getByRole('link', { name: ARTICLE_TITLE });
    await expect(articleLink).toBeVisible();
    await expect(articleLink).toHaveAttribute('href', `/${CATEGORY_SLUG}/${ARTICLE_SLUG}`);

    const articleHeading = page.getByRole('heading', { level: 2, name: ARTICLE_TITLE });
    const headingId = await articleHeading.getAttribute('id');
    expect(headingId).toBeTruthy();
    await expect(articleLink).toHaveAttribute('aria-labelledby', headingId ?? '');

    await waitForImageLoaded(articleLink.locator('img'));
    await waitForFontsReady(page);

    await expect(page).toHaveScreenshot('category-populated.png', { fullPage: true });
  });

  test('estado vazio: categoria existe, sem Artigo publicado', async ({ page }) => {
    await resetFixtureState('empty');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${CATEGORY_SLUG}`);

    await expect(page.getByRole('heading', { level: 1, name: CATEGORY_NAME })).toBeVisible();
    await expect(page.getByText('Nenhum artigo publicado nesta categoria ainda.')).toBeVisible();
    await waitForFontsReady(page);

    await expect(page).toHaveScreenshot('category-empty.png', { fullPage: true });
  });
});
