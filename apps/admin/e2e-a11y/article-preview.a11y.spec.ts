import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import { PREVIEW_PRODUCT_ID, PREVIEW_PRODUCT_NAME, openArticlePreview, setupArticleWithPreviewContent } from './article-preview-fixtures';

/**
 * UXE-009A — Preview do Artigo aberto, em browser real contra o build de
 * produção: (1) estrutura semântica produzida pelo pipeline MDX REAL
 * (`compileArticleBody` → `@mdx-js/mdx`, que o Jest deste app não carrega —
 * ver `compile-article-body.spec.ts`), inclusive a premissa dos seletores
 * `>` do CSS da UXE-009A (blocos como filhos diretos do contêiner do
 * Preview); (2) axe com o Preview aberto (contraste de link, listas,
 * headings, imagem).
 *
 * Só semântica e axe — nenhum estilo calculado aqui. A apresentação (ritmo
 * vertical, escala tipográfica, listas, citação, link/foco, reflow) é
 * verificada em `article-preview-presentation.spec.ts`, arquivo próprio.
 * O cenário existente `create-edit-article.a11y.spec.ts` não é alterado.
 */
test.describe('UXE-009A — a11y: Preview do Artigo aberto (Admin)', () => {
  test('estrutura semântica real do Preview e nenhuma violação axe com o Preview aberto', async ({ page }) => {
    await setupArticleWithPreviewContent(page);
    const { content } = await openArticlePreview(page);

    // Filhos diretos do contêiner, na ordem do bodyMdx — sem wrapper.
    const directChildren = await content.evaluate((element) =>
      Array.from(element.children).map((child) => child.tagName.toLowerCase()),
    );
    expect(directChildren).toEqual([
      'h2', // `# Título do corpo` remapeado (components={{ h1: 'h2' }})
      'p',
      'p',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'ul', // lista "loose" (legado): <li><p>…</p></li>
      'blockquote',
      'div', // ProductBlockPreview
      'p', // imagem dentro de parágrafo
      'p',
    ]);

    const levels = await content
      .getByRole('heading')
      .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
    expect(levels).toEqual([2, 2, 3, 4, 5, 6]);

    const lists = content.getByRole('list');
    await expect(lists).toHaveCount(3);
    await expect(lists.nth(0).getByRole('listitem')).toHaveCount(3);
    await expect(lists.nth(1).getByRole('listitem')).toHaveCount(2);
    await expect(lists.nth(2).locator(':scope > li > p')).toHaveCount(2);

    await expect(content.getByRole('link', { name: 'link do parágrafo' })).toHaveAttribute('href', 'https://exemplo.com/a');
    await expect(content.locator(':scope > blockquote')).toContainText('Citação de exemplo.');

    const productBlock = content.locator(`:scope > [data-product-id="${PREVIEW_PRODUCT_ID}"]`);
    await expect(productBlock).toHaveText(PREVIEW_PRODUCT_NAME);

    await expect(content.locator(':scope > p > img')).toHaveAttribute('alt', 'Foto do produto');

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
