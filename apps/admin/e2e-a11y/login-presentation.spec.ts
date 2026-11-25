import { expect, test, type Locator, type Page } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';

/**
 * UXP-004 — asserts programáticos de apresentação do login redesenhado, em
 * browser real (build de produção). Arquivo próprio, separado do spec de
 * axe (`login.a11y.spec.ts`), conforme a convenção do projeto. Fluxo de
 * autenticação (API, sessão, redirecionamento) continua coberto pelos specs
 * já existentes; aqui só a apresentação e a interação de teclado.
 */

const FORM_MAX_WIDTH_PX = 400;
const CONTROL_HEIGHT_PX = 48;
const MIN_TEXT_CONTRAST = 4.5;

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Contraste WCAG entre a cor do texto (com alfa composto sobre o fundo) e a cor de fundo do painel. */
async function contrastAgainstPanel(text: Locator, panel: Locator): Promise<number> {
  const panelHandle = await panel.elementHandle();
  return text.evaluate((element, panelElement) => {
    const parse = (value: string) => {
      const probe = document.createElement('canvas').getContext('2d')!;
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b!, a: a! / 255 };
    };
    const background = parse(getComputedStyle(panelElement as Element).backgroundColor);
    const foreground = parse(getComputedStyle(element).color);
    const blend = (channel: 'r' | 'g' | 'b') => foreground[channel] * foreground.a + background[channel] * (1 - foreground.a);
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const linear = [r, g, b].map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const fg = luminance({ r: blend('r'), g: blend('g'), b: blend('b') });
    const bg = luminance(background);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  }, panelHandle);
}

test.describe('UXP-004 — login: apresentação (browser real)', () => {
  test('desktop 1440: painéis 48/52, institucional à esquerda, formulário centralizado até 400px, controles de 48px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');

    const aside = page.getByRole('complementary', { name: 'Commerce Platform' });
    const main = page.getByRole('main');
    await expect(aside).toBeVisible();
    const asideBox = await box(aside);
    const mainBox = await box(main);

    expect(asideBox.x).toBe(0);
    expect(mainBox.x).toBeGreaterThanOrEqual(asideBox.x + asideBox.width - 1);
    expect(Math.abs(asideBox.width / 1440 - 0.48)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(mainBox.width / 1440 - 0.52)).toBeLessThanOrEqual(0.005);

    const heading = page.getByRole('heading', { level: 1, name: 'Bem-vindo de volta' });
    const formColumn = heading.locator('xpath=..');
    const columnBox = await box(formColumn);
    expect(columnBox.width).toBeLessThanOrEqual(FORM_MAX_WIDTH_PX);
    expect(Math.abs(columnBox.x + columnBox.width / 2 - (mainBox.x + mainBox.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(columnBox.y + columnBox.height / 2 - (mainBox.y + mainBox.height / 2))).toBeLessThanOrEqual(2);

    for (const control of [page.getByLabel('E-mail'), page.getByLabel('Senha', { exact: true }), page.getByRole('button', { name: 'Entrar' })]) {
      expect(Math.round((await box(control)).height)).toBe(CONTROL_HEIGHT_PX);
    }
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('painel institucional: textos com contraste ≥ 4,5:1 sobre a superfície inversa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    const aside = page.getByRole('complementary', { name: 'Commerce Platform' });
    for (const text of [
      aside.getByText('Commerce Platform', { exact: true }),
      aside.getByText('Gestão editorial'),
      aside.getByText('Sua operação editorial em um só lugar.'),
      aside.getByText('Gerencie conteúdos, produtos e ofertas com simplicidade e eficiência.'),
      aside.getByText(/© \d{4} Commerce Platform/),
    ]) {
      const ratio = await contrastAgainstPanel(text, aside);
      expect(ratio, `${await text.textContent()}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  for (const [width, height] of [
    [360, 740],
    [320, 568],
  ] as const) {
    test(`mobile ${width}×${height}: faixa com a marca, sem conteúdo institucional, formulário em destaque, sem overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/login');

      await expect(page.getByRole('banner').getByText('Commerce Platform')).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Commerce Platform' })).toBeHidden();
      await expect(page.getByText('Sua operação editorial em um só lugar.')).toBeHidden();
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0);

      // O formulário aparece sem rolar: título e e-mail na primeira tela.
      await expect(page.getByRole('heading', { level: 1, name: 'Bem-vindo de volta' })).toBeInViewport();
      await expect(page.getByLabel('E-mail')).toBeInViewport();
      // Ação principal alcançável por rolagem em telas baixas.
      const submit = page.getByRole('button', { name: 'Entrar' });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      expect((await box(page.getByRole('button', { name: 'Mostrar senha' }))).width).toBeGreaterThanOrEqual(44);
    });
  }

  test('pouca altura / zoom (640×360): sem overflow horizontal e ações alcançáveis', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto('/login');
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0);
    const submit = page.getByRole('button', { name: 'Entrar' });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
  });

  test('teclado: ordem e-mail → senha → mostrar senha → Entrar, foco visível, alternância por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');

    const email = page.getByLabel('E-mail');
    await email.focus();
    const order: Locator[] = [
      page.getByLabel('Senha', { exact: true }),
      page.getByRole('button', { name: 'Mostrar senha' }),
      page.getByRole('button', { name: 'Entrar' }),
    ];
    for (const next of order) {
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
      const ring = await next.evaluate((element) => getComputedStyle(element).boxShadow);
      expect(ring, 'foco visível (ring)').not.toBe('none');
    }

    await page.getByLabel('Senha', { exact: true }).fill('segredo');
    const toggle = page.getByRole('button', { name: 'Mostrar senha' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ocultar senha' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'password');
  });

  test('prefers-reduced-motion: indicador de envio sem animação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Login fica pendente (nunca responde) para observar o estado de envio.
    await page.route(`${MOCK_API_ORIGIN}/admin/auth/login`, async () => {
      // sem `fulfill`: a requisição fica pendente de propósito
    });
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('ana@fastcompre.test');
    await page.getByLabel('Senha', { exact: true }).fill('senha-correta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const submitting = page.getByRole('button', { name: 'Entrando...' });
    await expect(submitting).toBeDisabled();
    const animation = await submitting.locator('svg').evaluate((svg) => getComputedStyle(svg).animationName);
    expect(animation).toBe('none');
    await expect(page.getByRole('form', { name: 'Bem-vindo de volta' })).toHaveAttribute('aria-busy', 'true');
  });
});
