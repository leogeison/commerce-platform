import { expect, test } from '@playwright/test';
import { mockClicksDashboard, openClicksDashboard } from '../e2e-a11y/clicks-dashboard-fixtures';

/**
 * UXP-006 — baseline visual do dashboard de cliques (1440 e 360), com a API
 * simulada e o relógio do navegador congelado (`clicks-dashboard-fixtures.ts`),
 * para o PNG nunca variar por conteúdo ou horário.
 */

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 360, height: 800 },
]) {
  test(`dashboard de cliques — estado populado (${viewport.name} ${viewport.width})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockClicksDashboard(page);
    await openClicksDashboard(page);
    await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ranking de artigos' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`clicks-dashboard-${viewport.name}.png`, { fullPage: true });
  });
}
