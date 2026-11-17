import { expect, test, type Locator, type Page } from '@playwright/test';
import { PREVIEW_PRODUCT_NAME, openArticlePreview, setupArticleWithPreviewContent } from './article-preview-fixtures';

/**
 * UXE-009A — Fidelidade visual do Preview do Artigo: apresentação em
 * browser real (build de produção), por estilos CALCULADOS
 * (`getComputedStyle`) e geometria — nunca por nome de classe nem por
 * screenshot (nenhum baseline visual nesta corretiva; `e2e-visual/` é
 * restrito a captura de PNGs pelo próprio config).
 *
 * Valores esperados = os do renderer público
 * (`apps/fastcompre/.../[articleSlug]/page.tsx`, `mdxComponents`), que a
 * UXE-009A reproduz só na camada visual do Preview do Admin. Cores
 * esperadas são resolvidas a partir dos próprios tokens semânticos
 * (`packages/ui/tokens/semantic-colors.css`) no browser — nenhum hex aqui.
 *
 * Arquivo próprio neste harness, separado da cobertura de axe/semântica
 * (`article-preview.a11y.spec.ts`).
 */

type CssProperty =
  | 'marginTop'
  | 'marginBottom'
  | 'paddingLeft'
  | 'fontSize'
  | 'lineHeight'
  | 'fontWeight'
  | 'textTransform'
  | 'letterSpacing'
  | 'color'
  | 'listStyleType'
  | 'borderLeftWidth'
  | 'borderLeftStyle'
  | 'borderLeftColor'
  | 'textDecorationLine'
  | 'textDecorationThickness'
  | 'textUnderlineOffset'
  | 'outlineStyle'
  | 'outlineWidth'
  | 'outlineColor'
  | 'display';

async function computed(locator: Locator, properties: CssProperty[]): Promise<Record<CssProperty, string>> {
  return locator.evaluate((element, props) => {
    const style = window.getComputedStyle(element);
    return Object.fromEntries(props.map((prop) => [prop, style[prop as keyof CSSStyleDeclaration] as string]));
  }, properties) as Promise<Record<CssProperty, string>>;
}

/** Cor calculada de um token semântico (`var(--…)`), resolvida no próprio browser. */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const value = window.getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

test.describe('UXE-009A — apresentação do Preview do Artigo (estilos calculados)', () => {
  test('ritmo vertical e hierarquia tipográfica de parágrafos e headings', async ({ page }) => {
    await setupArticleWithPreviewContent(page);
    const { content } = await openArticlePreview(page);
    const child = (index: number) => content.locator(`:scope > :nth-child(${index})`);

    // Primeiro bloco: sem margem própria (decisão mantida — no público, ela colapsa com o contêiner).
    expect((await computed(child(1), ['marginTop'])).marginTop).toBe('0px');
    // H1 do corpo, remapeado para H2, recebe a escala de H2.
    expect(await computed(child(1), ['fontSize', 'lineHeight', 'fontWeight'])).toEqual({
      fontSize: '24px',
      lineHeight: '32px',
      fontWeight: '600',
    });

    // Parágrafos: mt-4 + leading-relaxed (1.625 × 16px).
    expect(await computed(child(3), ['marginTop', 'lineHeight'])).toEqual({ marginTop: '16px', lineHeight: '26px' });

    const headingScale = {
      h2: { marginTop: '40px', fontSize: '24px', lineHeight: '32px', fontWeight: '600' },
      h3: { marginTop: '32px', fontSize: '20px', lineHeight: '28px', fontWeight: '600' },
      h4: { marginTop: '24px', fontSize: '18px', lineHeight: '28px', fontWeight: '600' },
      h5: { marginTop: '24px', fontSize: '16px', lineHeight: '24px', fontWeight: '600' },
      h6: { marginTop: '24px', fontSize: '14px', lineHeight: '20px', fontWeight: '600' },
    } as const;
    for (const [tag, expected] of Object.entries(headingScale)) {
      const heading = tag === 'h2' ? content.locator(':scope > h2').nth(1) : content.locator(`:scope > ${tag}`);
      expect(await computed(heading, ['marginTop', 'fontSize', 'lineHeight', 'fontWeight']), tag).toEqual(expected);
    }

    // Hierarquia estritamente decrescente H2 > H3 > H4 > H5 > H6.
    const sizes = Object.values(headingScale).map((value) => Number.parseFloat(value.fontSize));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);

    const h6 = await computed(content.locator(':scope > h6'), ['textTransform', 'letterSpacing', 'color']);
    expect(h6.textTransform).toBe('uppercase');
    expect(h6.letterSpacing).toBe('0.35px'); // 0.025em × 14px
    expect(h6.color).toBe(await tokenColor(page, '--color-text-muted'));

    expect((await computed(content, ['color'])).color).toBe(await tokenColor(page, '--color-text-primary'));
  });

  test('listas: marcadores, indentação, espaçamento entre itens e lista "loose"', async ({ page }) => {
    await setupArticleWithPreviewContent(page);
    const { content } = await openArticlePreview(page);

    const ul = content.locator(':scope > ul').first();
    const ol = content.locator(':scope > ol');
    expect(await computed(ul, ['listStyleType', 'paddingLeft', 'marginTop'])).toEqual({
      listStyleType: 'disc',
      paddingLeft: '24px',
      marginTop: '16px',
    });
    expect(await computed(ol, ['listStyleType', 'paddingLeft', 'marginTop'])).toEqual({
      listStyleType: 'decimal',
      paddingLeft: '24px',
      marginTop: '16px',
    });

    // space-y-2: 8px entre itens, nenhum após o último.
    const items = ul.locator(':scope > li');
    expect((await computed(items.nth(0), ['marginBottom'])).marginBottom).toBe('8px');
    expect((await computed(items.nth(2), ['marginBottom'])).marginBottom).toBe('0px');
    const first = await items.nth(0).boundingBox();
    const second = await items.nth(1).boundingBox();
    expect(first && second ? Math.round(second.y - (first.y + first.height)) : null).toBe(8);

    // Lista "loose" (legado): parágrafo dentro do item também recebe o ritmo de parágrafo.
    const loose = content.locator(':scope > ul').nth(1);
    expect((await computed(loose.locator(':scope > li > p').nth(1), ['marginTop'])).marginTop).toBe('16px');
  });

  test('citação, link (normal, hover e foco visível) e bloco Produto/Oferta', async ({ page }) => {
    await setupArticleWithPreviewContent(page);
    const { content } = await openArticlePreview(page);

    const blockquote = await computed(content.locator(':scope > blockquote'), [
      'marginTop',
      'paddingLeft',
      'borderLeftWidth',
      'borderLeftStyle',
      'borderLeftColor',
      'color',
    ]);
    expect(blockquote).toEqual({
      marginTop: '24px',
      paddingLeft: '16px',
      borderLeftWidth: '2px',
      borderLeftStyle: 'solid',
      borderLeftColor: await tokenColor(page, '--color-border-default'),
      color: await tokenColor(page, '--color-text-secondary'),
    });

    const link = content.getByRole('link', { name: 'link do parágrafo' });
    const linkStyle = await computed(link, ['color', 'textDecorationLine', 'textDecorationThickness', 'textUnderlineOffset']);
    expect(linkStyle).toEqual({
      color: await tokenColor(page, '--color-accent-text'),
      textDecorationLine: 'underline',
      textDecorationThickness: '1px',
      textUnderlineOffset: '2px',
    });
    // Link distinguível do texto ao redor por algo além de cor (sublinhado) e por cor.
    expect(linkStyle.color).not.toBe((await computed(content.locator(':scope > p').first(), ['color'])).color);

    await link.hover();
    expect((await computed(link, ['textDecorationThickness'])).textDecorationThickness).toBe('2px');

    // Foco por teclado (`:focus-visible`): Shift+Tab/Tab a partir do link garante modalidade de teclado.
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    expect(await computed(link, ['outlineStyle', 'outlineWidth', 'outlineColor'])).toEqual({
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineColor: await tokenColor(page, '--color-focus-ring'),
    });

    // Bloco Produto/Oferta: mt-8 do card público.
    const productBlock = content.locator(':scope > div').filter({ hasText: PREVIEW_PRODUCT_NAME });
    expect((await computed(productBlock, ['marginTop'])).marginTop).toBe('32px');
  });

  test('imagem dentro de parágrafo e reflow a 320px, sem overflow horizontal do conteúdo', async ({ page }) => {
    await setupArticleWithPreviewContent(page);
    const { content } = await openArticlePreview(page);

    const image = content.locator(':scope > p > img');
    expect((await computed(image.locator('xpath=..'), ['marginTop'])).marginTop).toBe('16px');
    expect((await computed(image, ['display'])).display).toBe('block');

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(image).toBeVisible();

    const overflow = await content.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    const contentBox = await content.boundingBox();
    const imageBox = await image.boundingBox();
    expect(contentBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    // Imagem de 800px intrínsecos encolhe para caber no contêiner.
    expect(imageBox!.width).toBeLessThanOrEqual(contentBox!.width + 0.5);
    expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(contentBox!.x + contentBox!.width + 0.5);
  });
});
