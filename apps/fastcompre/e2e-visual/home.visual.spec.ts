import { expect, test } from '@playwright/test';
import { ARTICLE_SLUG, ARTICLE_TITLE, CATEGORY_SLUG } from './fixtures.mjs';
import { resetFixtureState } from './fixture-state-control';
import { waitForFontsReady, waitForImageLoaded } from './wait-for-stable';

/**
 * UXW-015 — baseline visual da Home (`/`), estados populado e vazio.
 *
 * Cada teste chama `resetFixtureState(...)` antes de `page.goto()` — define
 * o estado do mock E força o FastCompre a descartar o Data Cache
 * (`fetchCache: 'force-cache'` em `(home)/page.tsx`) da execução anterior,
 * então os dois testes são independentes de ordem (ver doc comment de
 * `fixture-state-control.ts`).
 */
test.describe('FastCompre — Home (UXW-015)', () => {
  test('estado populado: um Artigo com capa, título, resumo e data', async ({ page }) => {
    await resetFixtureState('populated');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // CORRIGIDO nesta rodada: o `<a>` do hero ganhou `aria-labelledby`
    // apontando para o `id` do `<h2>` visível (`home-hero-title-${id}`,
    // ver `(home)/page.tsx`) — antes disso, o `<article>` (role ARIA
    // implícito "article") bloqueava a propagação do texto do heading
    // para o nome acessível do link ancestral no Chromium (reproduzido
    // isoladamente nesta investigação), então `getByRole('link', {name:
    // ARTICLE_TITLE})` não encontrava o elemento. Volta a ser o locator
    // natural; a asserção de `href` continua explícita, e a checagem
    // abaixo confirma a ASSOCIAÇÃO em si (`aria-labelledby` === `id` do
    // heading), não só o resultado.
    const articleLink = page.getByRole('link', { name: ARTICLE_TITLE });
    await expect(articleLink).toBeVisible();
    await expect(articleLink).toHaveAttribute('href', `/${CATEGORY_SLUG}/${ARTICLE_SLUG}`);

    const articleHeading = page.getByRole('heading', { level: 2, name: ARTICLE_TITLE });
    const headingId = await articleHeading.getAttribute('id');
    expect(headingId).toBeTruthy();
    await expect(articleLink).toHaveAttribute('aria-labelledby', headingId ?? '');

    await waitForImageLoaded(articleLink.locator('img'));
    await waitForFontsReady(page);

    await expect(page).toHaveScreenshot('home-populated.png', { fullPage: true });
  });

  test('estado vazio: nenhum Artigo publicado ainda', async ({ page }) => {
    await resetFixtureState('empty');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.getByText('Nenhum artigo publicado ainda.')).toBeVisible();
    await waitForFontsReady(page);

    await expect(page).toHaveScreenshot('home-empty.png', { fullPage: true });
  });
});
