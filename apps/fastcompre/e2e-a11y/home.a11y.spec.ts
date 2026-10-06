import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resetFixtureState } from '../e2e-visual/fixture-state-control';
import { ARTICLE_TITLE } from '../e2e-visual/fixtures.mjs';

/**
 * UXQ-001 — prova mínima de infraestrutura no FastCompre: harness
 * Playwright + axe-core contra build real (nunca `next dev`), reutilizando
 * somente-leitura o mock/fixtures já existentes da UXW-015
 * (`../e2e-visual/fixture-state-control.ts`, `../e2e-visual/fixtures.mjs`)
 * — nenhum arquivo de `e2e-visual/` é modificado por esta tarefa.
 *
 * Dois testes provam as duas partes do critério de aceite da UXQ-001
 * ("...roda e reporta violações de axe corretamente"):
 *
 * 1. a Home real, populada, carrega via build real e não reporta nenhuma
 *    violação WCAG hoje;
 * 2. uma violação CONHECIDA e DETERMINÍSTICA (`button-name`), injetada
 *    deliberadamente via `page.evaluate()` num elemento temporário do DOM
 *    — nunca em código de aplicação; nenhuma rota, componente ou fixture
 *    inválida foi criada em `apps/fastcompre/src` — É DETECTADA pelo axe.
 *
 * Esta é a única prova de detecção de violação desta tarefa: por decisão
 * do PO, não é duplicada no harness do Admin
 * (`apps/admin/e2e-a11y/login.a11y.spec.ts`, que só prova a infraestrutura
 * contra uma página real limpa).
 */

/**
 * CORREÇÃO (rodada de validação local, PO) — mesma política aplicada em
 * `apps/admin/e2e-a11y/login.a11y.spec.ts` (ver comentário equivalente lá
 * para a justificativa completa): o teste 1 (varredura irrestrita da Home)
 * usa `WCAG_AA_CUMULATIVE_TAGS` para que o gate corresponda ao requisito
 * normativo WCAG 2.2 AA cumulativo, e não falhe por regras
 * exclusivamente `best-practice` (ex.: `page-has-heading-one`, sem tag
 * `wcagXX`, confirmado no `axe-core@4.13.0` efetivamente instalado).
 *
 * O teste 2 (detecção deliberada) NÃO leva esse filtro — continua usando
 * `withRules(['button-name'])`, sem alteração: `button-name` já carrega
 * `wcag2a`/`wcag412` no mesmo `axe-core@4.13.0` (confirmado), então
 * continuaria sendo detectado pelo filtro de qualquer forma; manter o
 * `withRules` inalterado é a correção mínima (nenhum motivo para tocar o
 * teste que não falhou).
 */
const WCAG_AA_CUMULATIVE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('UXQ-001 — a11y smoke (FastCompre)', () => {
  test('Home (estado populado) carrega via build real e não reporta violação axe', async ({
    page,
  }) => {
    await resetFixtureState('populated');
    await page.goto('/');
    await expect(page.getByRole('link', { name: ARTICLE_TITLE })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('violação axe injetada deliberadamente (button-name) é detectada', async ({ page }) => {
    await resetFixtureState('populated');
    await page.goto('/');
    await expect(page.getByRole('link', { name: ARTICLE_TITLE })).toBeVisible();

    // Elemento temporário, só nesta execução de teste, nunca persistido em
    // nenhum arquivo de aplicação: um <button> sem nome acessível (sem
    // texto, sem aria-label, sem title) viola deterministicamente a regra
    // `button-name` do axe-core (WCAG 2.0 4.1.2, tag `wcag2a` — confirmado
    // no `axe-core@4.13.0` instalado).
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'uxq-001-deliberate-violation';
      document.body.appendChild(button);
    });

    const results = await new AxeBuilder({ page }).withRules(['button-name']).analyze();

    expect(results.violations).toHaveLength(1);
    expect(results.violations[0]?.id).toBe('button-name');
  });
});
