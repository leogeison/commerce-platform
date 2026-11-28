import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import { mockClicksDashboard, openClicksDashboard } from './clicks-dashboard-fixtures';

/**
 * UXP-006 — axe (WCAG 2.2 AA cumulativo) no dashboard de cliques, em
 * browser real contra o build de produção. API sempre simulada
 * (`clicks-dashboard-fixtures.ts`). Gate de regressão, não certificação:
 * teclado, leitor de tela, zoom/reflow e contraste seguem no checklist
 * manual (`docs/a11y/wcag-aa-checklist.md`). Asserts de apresentação ficam
 * em `clicks-dashboard-presentation.spec.ts`.
 */

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

for (const viewport of [
  { name: 'desktop 1440', width: 1440, height: 900 },
  { name: 'mobile 360', width: 360, height: 800 },
]) {
  test.describe(`UXP-006 — a11y: dashboard de cliques (${viewport.name})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test('estado populado, com as tabelas alternativas abertas, não reporta violação axe', async ({ page }) => {
      await mockClicksDashboard(page);
      await openClicksDashboard(page);
      await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();
      await expectNoAxeViolations(page);

      // Cada clique renomeia o botão ("Ocultar tabela"); sempre o primeiro ainda fechado.
      const closed = page.getByRole('button', { name: 'Ver como tabela' });
      for (let remaining = await closed.count(); remaining > 0; remaining -= 1) {
        await closed.first().click();
        await expect(closed).toHaveCount(remaining - 1);
      }
      await expect(page.getByRole('button', { name: 'Ocultar tabela' })).toHaveCount(4);
      await expectNoAxeViolations(page);
    });

    test('estado vazio não reporta violação axe', async ({ page }) => {
      await mockClicksDashboard(page, { empty: true });
      await openClicksDashboard(page);
      await expect(page.getByText('Nenhum clique registrado no período e filtros selecionados.')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('estado de erro (resumo indisponível) não reporta violação axe', async ({ page }) => {
      await mockClicksDashboard(page, { summaryError: true });
      await openClicksDashboard(page);
      await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('período personalizado aberto não reporta violação axe', async ({ page }) => {
      await mockClicksDashboard(page);
      await openClicksDashboard(page, '?period=custom&from=2026-01-01&to=2026-01-15');
      await expect(page.getByLabel('De', { exact: true })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}
