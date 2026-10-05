/**
 * apps/fastcompre/e2e-visual/wait-for-stable.ts
 *
 * UXW-015 — esperas explícitas de estabilidade, únicas antes de cada
 * `toHaveScreenshot()`. Nunca `networkidle` (item 6/8 do desenho técnico
 * aprovado) — cada espera aqui é específica ao que pode variar de verdade
 * (fonte ainda não trocada do fallback, imagem ainda não decodificada),
 * nunca um proxy genérico de "a rede parou".
 */
import type { Locator, Page } from '@playwright/test';

/**
 * `document.fonts.ready` resolve quando toda fonte usada no documento até
 * aquele momento terminou de carregar — usado em vez de um `waitForTimeout`
 * arbitrário. Necessário aqui e não no harness do Admin (UXA-020/UXE-016)
 * porque só o FastCompre carrega fontes customizadas via `next/font/google`
 * (Geist Sans/Source Serif 4, `layout.tsx`) — o Admin usa a fonte padrão do
 * sistema/navegador, sem `font-display: swap` para esperar.
 */
export async function waitForFontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Espera a imagem ficar visível E de fato decodificada (`complete` +
 * `naturalWidth > 0`) — cobre tanto o caso "ainda carregando" quanto
 * "carregou mas falhou" (`complete` fica `true` também em erro, sem
 * `naturalWidth`). Nunca aceita um `<img>` quebrado como pronto para
 * screenshot.
 */
export async function waitForImageLoaded(locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  await locator.evaluate((img) => {
    const element = img as HTMLImageElement;
    if (element.complete && element.naturalWidth > 0) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      element.addEventListener('load', () => resolve(), { once: true });
      element.addEventListener(
        'error',
        () => reject(new Error('[wait-for-stable] imagem falhou ao carregar')),
        { once: true },
      );
    });
  });
}
