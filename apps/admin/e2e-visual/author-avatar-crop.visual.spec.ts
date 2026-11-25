import { expect, test } from '@playwright/test';
import { LANDSCAPE_IMAGE, mockAuthorCreateFlow, openCropperOnNewAuthor } from '../e2e-a11y/author-avatar-crop-fixtures';

/**
 * UXP-003 — baseline visual do diálogo de recorte de avatar do Autor
 * (`AvatarCropDialog`), aberto sobre `/:siteSlug/authors/new` com a imagem
 * determinística de teste (`paisagem-1200x800.jpg`, sem foto real), em
 * 1440px e 360px. Captura da viewport (não `fullPage`): o diálogo é modal e
 * o fundo escurecido faz parte da composição.
 *
 * Fixtures/mocks reaproveitados somente-leitura de
 * `../e2e-a11y/author-avatar-crop-fixtures.ts` — mesma API mockada e mesma
 * imagem usadas pelos specs de browser real.
 */
test.describe('Admin — cropper de avatar do Autor (UXP-003)', () => {
  for (const [name, width, height] of [
    ['1440', 1440, 900],
    ['360', 360, 800],
  ] as const) {
    test(`diálogo de recorte aberto em ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockAuthorCreateFlow(page);
      const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);

      await expect(dialog.getByRole('group', { name: /Área de recorte/ })).toBeFocused();
      await expect(dialog.getByRole('img', { name: 'Prévia do avatar recortado' })).toHaveCSS(
        'background-image',
        /blob:/,
      );
      await dialog.locator('img').evaluate((image: HTMLImageElement) => image.decode());
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`author-avatar-crop-dialog-${name}.png`);
    });
  }
});
