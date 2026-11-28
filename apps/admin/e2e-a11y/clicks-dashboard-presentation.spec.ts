import { expect, test, type Page } from '@playwright/test';
import { FIXED_NOW, mockClicksDashboard, openClicksDashboard } from './clicks-dashboard-fixtures';

/**
 * UXP-006 — asserts programáticos de apresentação e interação do dashboard
 * de cliques em browser real (arquivo próprio, separado do spec de axe).
 * A visibilidade do "Exportar CSV" por Role é só apresentação: a
 * autorização real (EDITOR+) é verificada pelos e2e da API.
 */

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('UXP-006 — dashboard de cliques: apresentação (browser real)', () => {
  for (const width of [320, 360, 1440]) {
    test(`sem rolagem horizontal da página em ${width}px (tabelas largas rolam dentro da própria região)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockClicksDashboard(page);
      await openClicksDashboard(page);
      await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('período por teclado: setas alternam o rádio e a URL persiste o filtro', async ({ page }) => {
    await mockClicksDashboard(page);
    await openClicksDashboard(page);
    const sevenDays = page.getByRole('radio', { name: '7 dias' });
    await expect(sevenDays).toBeChecked();
    await sevenDays.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: '30 dias' })).toBeChecked();
    await expect(page).toHaveURL(/[?&]period=30d/);
  });

  test('filtros da URL são restaurados ao recarregar', async ({ page }) => {
    await mockClicksDashboard(page);
    await openClicksDashboard(page, '?period=30d&marketplace=AMAZON&botClass=likely_bot');
    await expect(page.getByRole('radio', { name: '30 dias' })).toBeChecked();
    await expect(page.getByLabel('Marketplace (no clique)')).toHaveValue('AMAZON');
    await expect(page.getByLabel('Classificação de bot')).toHaveValue('likely_bot');
  });

  test('todas as chamadas de uma atualização compartilham o mesmo asOf; "Atualizar" gera nova referência', async ({ page }) => {
    const calls: string[] = [];
    await mockClicksDashboard(page, { calls });
    await openClicksDashboard(page);
    await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();

    const dataCalls = () => calls.filter((url) => !url.includes('/filter-options')).map((url) => new URL(url).searchParams.get('asOf'));
    const first = new Set(dataCalls());
    expect(first).toEqual(new Set([FIXED_NOW.toISOString()]));

    const later = new Date(FIXED_NOW.getTime() + 5 * 60_000);
    await page.clock.setFixedTime(later);
    calls.length = 0;
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect.poll(() => new Set(dataCalls())).toEqual(new Set([later.toISOString()]));
  });

  test('"Ver como tabela" alterna aria-expanded e revela a tabela equivalente', async ({ page }) => {
    await mockClicksDashboard(page);
    await openClicksDashboard(page);
    const toggle = page.getByRole('button', { name: 'Ver como tabela' }).first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.press('Enter');
    const opened = page.getByRole('button', { name: 'Ocultar tabela' }).first();
    await expect(opened).toHaveAttribute('aria-expanded', 'true');
    const table = page.locator(`#${await opened.getAttribute('aria-controls')}`).getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(8); // cabeçalho + 7 dias
  });

  test('ordenação do histórico expõe aria-sort e reenvia a consulta', async ({ page }) => {
    const calls: string[] = [];
    await mockClicksDashboard(page, { calls });
    await openClicksDashboard(page);
    const header = page.getByRole('columnheader', { name: /Data e hora/ });
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(() => calls.some((url) => url.includes('/events') && url.includes('sort=clickedAt_asc'))).toBe(true);
  });

  for (const [role, visible] of [
    ['OWNER', true],
    ['EDITOR', true],
    ['VIEWER', false],
  ] as const) {
    test(`"Exportar CSV" ${visible ? 'visível' : 'oculto'} para ${role}`, async ({ page }) => {
      await mockClicksDashboard(page, { role });
      await openClicksDashboard(page);
      await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(visible ? 1 : 0);
    });
  }

  test('nenhuma animação/transição ativa com prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockClicksDashboard(page);
    await openClicksDashboard(page);
    await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();
    const animated = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *')).filter((element) => {
        const style = getComputedStyle(element);
        return style.animationName !== 'none' || parseFloat(style.transitionDuration) > 0.01;
      }).length,
    );
    expect(animated).toBe(0);
  });

  test('nunca rotula eventos como "humano"', async ({ page }) => {
    await mockClicksDashboard(page);
    await openClicksDashboard(page);
    await expect(page.getByRole('region', { name: 'Tabela do histórico de eventos' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/human/i);
  });
});
