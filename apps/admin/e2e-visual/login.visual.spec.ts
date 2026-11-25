import { expect, test } from '@playwright/test';
import { mockLogin } from '../e2e-a11y/fixtures';

/**
 * UXP-004 — baselines visuais do login redesenhado (estado inicial em
 * 1440px e 360px; erro de credencial 401 em 1440px). Mock de login
 * reaproveitado somente-leitura de `../e2e-a11y/fixtures.ts`.
 *
 * O copyright é mascarado: o ano é calculado no build e mudaria o
 * baseline a cada virada de ano sem nenhuma mudança de layout.
 */
test.describe('Admin — login (UXP-004)', () => {
  for (const [name, width, height] of [
    ['1440', 1440, 900],
    ['360', 360, 740],
  ] as const) {
    test(`estado inicial em ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/login');
      await expect(page.getByRole('heading', { level: 1, name: 'Bem-vindo de volta' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`login-${name}.png`, {
        fullPage: true,
        mask: [page.getByText(/© \d{4} Commerce Platform/)],
      });
    });
  }

  test('erro de credenciais (401) em 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockLogin(page, 'invalid-credentials');
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('ana@fastcompre.test');
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Filtro por texto: o anunciador de rotas do Next também tem role="alert"
    // (mesmo critério de `e2e-a11y/login.a11y.spec.ts`).
    await expect(page.getByRole('alert').filter({ hasText: 'Credenciais inválidas.' })).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click(); // tira o foco do botão (sem anel de foco na captura)
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('login-error-1440.png', {
      fullPage: true,
      mask: [page.getByText(/© \d{4} Commerce Platform/)],
    });
  });
});
