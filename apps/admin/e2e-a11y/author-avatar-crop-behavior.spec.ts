import { expect, test, type Locator, type Page } from '@playwright/test';
import { SITE_SLUG } from './fixtures';
import {
  AUTHOR_ID,
  EXIF_ORIENTATION_6_IMAGE,
  LANDSCAPE_IMAGE,
  UPLOADED_AVATAR_URL,
  decodeInBrowser,
  mockAuthorCreateFlow,
  openCropperOnNewAuthor,
} from './author-avatar-crop-fixtures';

/**
 * UXP-003 — asserts programáticos do cropper de avatar em browser real
 * (Chromium, build de produção, API mockada por `page.route`). Arquivo
 * próprio, separado do spec de axe (convenção do projeto). Aqui roda o
 * `react-easy-crop` real e a geração real da imagem em canvas — o que o
 * jsdom não consegue exercitar.
 */

const MIN_TOUCH_TARGET_PX = 44;
// Tolerância (pontos percentuais) para arredondamentos de subpixel ao
// recalcular o enquadramento num diálogo de outro tamanho.
const FRAMING_TOLERANCE_PERCENT = 1.5;

/** Enquadramento da prévia: área recortada em % da imagem original (independe do tamanho do diálogo). */
async function framingOf(preview: Locator) {
  return preview.evaluate((element) => {
    const style = getComputedStyle(element);
    const [positionX, positionY] = style.backgroundPosition.split(' ').map((value) => parseFloat(value));
    return { size: parseFloat(style.backgroundSize), positionX: positionX ?? 0, positionY: positionY ?? 0 };
  });
}

function previewOf(dialog: Locator) {
  return dialog.getByRole('img', { name: 'Prévia do avatar recortado' });
}

async function backgroundPosition(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundPosition);
}

async function activeElementIsInside(page: Page, container: Locator): Promise<boolean> {
  const handle = await container.elementHandle();
  return page.evaluate((dialog) => {
    const active = document.activeElement;
    return !!dialog && !!active && (dialog === active || dialog.contains(active));
  }, handle);
}

function isClose([r, g, b]: [number, number, number], [er, eg, eb]: [number, number, number], tolerance = 40) {
  return Math.abs(r - er) <= tolerance && Math.abs(g - eg) <= tolerance && Math.abs(b - eb) <= tolerance;
}

test.describe('UXP-003 — cropper de avatar do Autor (browser real)', () => {
  test('fluxo só com teclado: foco inicial na área, setas movem, zoom pelo range, foco preso, Aplicar e retorno de foco', async ({
    page,
  }) => {
    await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    const cropArea = dialog.getByRole('group', { name: /Área de recorte/ });
    const preview = previewOf(dialog);

    await expect(cropArea).toBeFocused();
    await expect(preview).toHaveCSS('background-image', /blob:/);
    const initialPosition = await backgroundPosition(preview);

    // Paisagem com `objectFit: cover`: há folga horizontal no zoom 1.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => backgroundPosition(preview)).not.toBe(initialPosition);

    // Zoom pelo range nativo, só com teclado.
    const slider = dialog.getByRole('slider', { name: 'Zoom' });
    await slider.focus();
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(slider).toHaveValue('1.5');
    await expect(slider).toHaveAttribute('aria-valuetext', '150%');

    // Foco preso no diálogo modal: 25 Tabs nunca levam o foco à página atrás.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await activeElementIsInside(page, dialog);
      const onBody = await page.evaluate(() => document.activeElement === document.body);
      expect(inside || onBody, `Tab ${i + 1} levou o foco para fora do diálogo`).toBe(true);
    }

    await dialog.getByRole('button', { name: 'Aplicar recorte' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Avatar')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Ajustar recorte' })).toBeVisible();
  });

  test('alternativa ao arraste (WCAG 2.5.7): botões de direção movem a imagem; arraste com mouse também funciona', async ({
    page,
  }) => {
    await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    const preview = previewOf(dialog);
    await expect(preview).toHaveCSS('background-image', /blob:/);

    const beforeButtons = await backgroundPosition(preview);
    await dialog.getByRole('button', { name: 'Mover imagem para a direita' }).click();
    await expect.poll(() => backgroundPosition(preview)).not.toBe(beforeButtons);

    const beforeDrag = await backgroundPosition(preview);
    const box = (await dialog.getByRole('group', { name: /Área de recorte/ }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => backgroundPosition(preview)).not.toBe(beforeDrag);

    await dialog.getByRole('button', { name: 'Restaurar enquadramento' }).click();
    await expect(dialog.getByRole('slider', { name: 'Zoom' })).toHaveValue('1');
  });

  test('a imagem gerada reflete a posição definida pelos botões de direção (não uma área desatualizada)', async ({
    page,
  }) => {
    const capture = await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    // Paisagem 1200×800 (vermelho até x=599, verde a partir de x=600 na
    // metade de cima). Recorte central = x 200–1000; encostado à esquerda =
    // x 0–800. O pixel de saída (333, 5) corresponde a x≈720 (verde) no
    // central e a x≈520 (vermelho) no encostado à esquerda.
    const moveRight = dialog.getByRole('button', { name: 'Mover imagem para a direita' });
    for (let i = 0; i < 15; i += 1) {
      await moveRight.click();
    }
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SITE_SLUG}/authors/${AUTHOR_ID}$`));

    const decoded = await decodeInBrowser(page, capture.uploads[0]!.bytes, 'image/webp', [[333, 5]]);
    expect(isClose(decoded.samples[0]!, [196, 90, 70]), `pixel ${decoded.samples[0]}`).toBe(true);
  });

  test('Cancelar e Escape não alteram o formulário e devolvem o foco ao campo de arquivo', async ({ page }) => {
    await mockAuthorCreateFlow(page);
    let dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Avatar')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Remover avatar' })).toHaveCount(0);

    await page.getByLabel('Avatar').setInputFiles(LANDSCAPE_IMAGE);
    dialog = page.getByRole('dialog', { name: 'Recortar avatar' });
    await dialog.getByRole('group', { name: /Área de recorte/ }).waitFor();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Avatar')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Remover avatar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajustar recorte' })).toHaveCount(0);
  });

  test('saída: WebP quadrado de 512×512, enviado pelo upload AUTHOR_AVATAR existente e persistido como avatarUrl', async ({
    page,
  }) => {
    const capture = await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SITE_SLUG}/authors/${AUTHOR_ID}$`));

    expect(capture.uploads).toHaveLength(1);
    const upload = capture.uploads[0]!;
    expect(upload.purpose).toBe('AUTHOR_AVATAR');
    expect(upload.contentType).toBe('image/webp');
    expect(upload.fileName).toBe('avatar.webp');
    // Área recortada de 800px (menor lado da paisagem) reduzida para 512.
    const decoded = await decodeInBrowser(page, upload.bytes, 'image/webp', []);
    expect(decoded).toMatchObject({ width: 512, height: 512 });
    expect(capture.createdBodies).toEqual([expect.objectContaining({ avatarUrl: UPLOADED_AVATAR_URL })]);
  });

  test('orientação EXIF 6: o recorte sai na orientação visual correta e sem ampliar a área menor que 512', async ({
    page,
  }) => {
    const capture = await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, EXIF_ORIENTATION_6_IMAGE);
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SITE_SLUG}/authors/${AUTHOR_ID}$`));

    const upload = capture.uploads[0]!;
    // Visual 600×400 → recorte central 400×400 (cover, zoom 1): saída 400,
    // nunca ampliada para 512.
    const decoded = await decodeInBrowser(page, upload.bytes, upload.contentType ?? 'image/webp', [
      [100, 100],
      [300, 100],
      [100, 300],
      [300, 300],
    ]);
    expect(decoded.width).toBe(400);
    expect(decoded.height).toBe(400);
    const [topLeft, topRight, bottomLeft, bottomRight] = decoded.samples;
    expect(isClose(topLeft!, [255, 0, 0]), `sup. esq. ${topLeft}`).toBe(true);
    expect(isClose(topRight!, [0, 255, 0]), `sup. dir. ${topRight}`).toBe(true);
    expect(isClose(bottomLeft!, [0, 0, 255]), `inf. esq. ${bottomLeft}`).toBe(true);
    expect(isClose(bottomRight!, [255, 255, 0]), `inf. dir. ${bottomRight}`).toBe(true);
  });

  test('retomar enquadramento: "Ajustar recorte" reabre no mesmo recorte, inclusive com o diálogo em outro tamanho; Restaurar volta ao centro', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAuthorCreateFlow(page);
    let dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    let preview = previewOf(dialog);
    await expect(preview).toHaveCSS('background-image', /blob:/);
    const centered = await framingOf(preview);

    await dialog.getByRole('slider', { name: 'Zoom' }).fill('2');
    for (let i = 0; i < 3; i += 1) {
      await dialog.getByRole('button', { name: 'Mover imagem para a direita' }).click();
    }
    for (let i = 0; i < 2; i += 1) {
      await dialog.getByRole('button', { name: 'Mover imagem para cima' }).click();
    }
    await expect.poll(async () => (await framingOf(preview)).positionY).toBeGreaterThan(0);
    const applied = await framingOf(preview);
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();

    // Reabre com o diálogo bem menor: a área recortada (em % da imagem
    // original, independente do tamanho do diálogo) deve ser equivalente.
    await page.setViewportSize({ width: 420, height: 900 });
    await page.getByRole('button', { name: 'Ajustar recorte' }).click();
    dialog = page.getByRole('dialog', { name: 'Recortar avatar' });
    await dialog.getByRole('group', { name: /Área de recorte/ }).waitFor();
    preview = previewOf(dialog);
    await expect
      .poll(async () => {
        const restored = await framingOf(preview);
        return Math.max(
          Math.abs(restored.size - applied.size),
          Math.abs(restored.positionX - applied.positionX),
          Math.abs(restored.positionY - applied.positionY),
        );
      })
      .toBeLessThanOrEqual(FRAMING_TOLERANCE_PERCENT);
    // Zoom equivalente (não exigido como igualdade numérica exata).
    const restoredZoom = Number(await dialog.getByRole('slider', { name: 'Zoom' }).inputValue());
    expect(Math.abs(restoredZoom - 2)).toBeLessThanOrEqual(0.05);

    // Restaurar enquadramento: centro, zoom 1 — o mesmo da abertura inicial.
    await dialog.getByRole('button', { name: 'Restaurar enquadramento' }).click();
    await expect(dialog.getByRole('slider', { name: 'Zoom' })).toHaveValue('1');
    await expect
      .poll(async () => {
        const reset = await framingOf(preview);
        return Math.max(Math.abs(reset.size - centered.size), Math.abs(reset.positionX - centered.positionX));
      })
      .toBeLessThanOrEqual(FRAMING_TOLERANCE_PERCENT);
  });

  test('Ajustar recorte reabre sobre o original e o novo recorte substitui o anterior', async ({ page }) => {
    const capture = await mockAuthorCreateFlow(page);
    let dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Ajustar recorte' }).click();
    dialog = page.getByRole('dialog', { name: 'Recortar avatar' });
    await dialog.getByRole('group', { name: /Área de recorte/ }).waitFor();
    // Zoom 2 sobre o ORIGINAL: área de 400px → saída 400 (prova que o
    // ajuste parte do original de 1200×800, não do recorte de 512 já gerado).
    await dialog.getByRole('slider', { name: 'Zoom' }).fill('2');
    await dialog.getByRole('button', { name: 'Aplicar recorte' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Ajustar recorte' })).toBeFocused();

    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SITE_SLUG}/authors/${AUTHOR_ID}$`));
    expect(capture.uploads).toHaveLength(1);
    const decoded = await decodeInBrowser(page, capture.uploads[0]!.bytes, 'image/webp', []);
    expect(decoded.width).toBe(400);
  });

  for (const width of [320, 360]) {
    test(`${width}px: diálogo sem overflow horizontal, dentro da viewport, alvos de toque ≥ 44px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await mockAuthorCreateFlow(page);
      const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);

      const overflow = await dialog.evaluate((element) => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: element.scrollWidth - element.clientWidth,
        right: element.getBoundingClientRect().right,
        left: element.getBoundingClientRect().left,
      }));
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.dialog).toBeLessThanOrEqual(0);
      expect(overflow.left).toBeGreaterThanOrEqual(0);
      expect(overflow.right).toBeLessThanOrEqual(width);

      for (const button of await dialog.getByRole('button').all()) {
        const box = (await button.boundingBox())!;
        const name = await button.textContent();
        expect(box.height, `altura de "${name}"`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
        expect(box.width, `largura de "${name}"`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      }
      const sliderBox = (await dialog.getByRole('slider', { name: 'Zoom' }).boundingBox())!;
      expect(sliderBox.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    });
  }

  test('zoom de página 200% (reflow): diálogo continua sem overflow horizontal e com ações alcançáveis', async ({
    page,
  }) => {
    // 1280px a 200% ≈ 640px CSS — mesma técnica de reflow por viewport
    // reduzida já usada no projeto; a validação manual de zoom real continua
    // obrigatória (WCAG 1.4.4/1.4.10).
    await page.setViewportSize({ width: 640, height: 450 });
    await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const apply = dialog.getByRole('button', { name: 'Aplicar recorte' });
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport();
  });

  test('prefers-reduced-motion: nenhuma animação/transição ativa no diálogo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAuthorCreateFlow(page);
    const dialog = await openCropperOnNewAuthor(page, LANDSCAPE_IMAGE);
    const animated = await dialog.evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll('*'))].filter((element) => {
        const style = getComputedStyle(element);
        const hasAnimation = style.animationName !== 'none' && parseFloat(style.animationDuration) > 0;
        const hasTransition = parseFloat(style.transitionDuration) > 0;
        return hasAnimation || hasTransition;
      }).length,
    );
    expect(animated).toBe(0);
  });
});
