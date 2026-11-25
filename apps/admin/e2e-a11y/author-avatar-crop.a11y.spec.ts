import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import { LANDSCAPE_IMAGE, mockAuthorCreateFlow, openCropperOnNewAuthor } from './author-avatar-crop-fixtures';

/**
 * UXP-003 — axe (WCAG 2.x AA cumulativo) no cropper de avatar em browser
 * real. Gate de regressão, não certificação: teclado, leitor de tela e zoom
 * reais continuam exigindo validação manual. Asserts programáticos de
 * apresentação/comportamento ficam em `author-avatar-crop-behavior.spec.ts`.
 */
test.describe('UXP-003 — a11y: cropper de avatar do Autor (Admin)', () => {
  for (const width of [1440, 360]) {
    test(`${width}px: diálogo aberto e formulário com recorte aplicado não reportam violação axe`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 720 });
      await mockAuthorCreateFlow(page);
      const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);

      const dialogResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
      expect(dialogResults.violations, JSON.stringify(dialogResults.violations, null, 2)).toEqual([]);

      await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Ajustar recorte' })).toBeVisible();

      const formResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
      expect(formResults.violations, JSON.stringify(formResults.violations, null, 2)).toEqual([]);
    });
  }
});
