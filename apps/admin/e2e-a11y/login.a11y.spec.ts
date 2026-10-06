import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * UXQ-001 — prova mínima de infraestrutura no Admin: harness Playwright +
 * axe-core contra build real (nunca `next dev`).
 *
 * `/login` foi escolhida por ser rota estável e pública: `login/page.tsx`
 * é Server Component puro, sem fetch e sem guarda de sessão (o próprio
 * arquivo documenta que a guarda de "usuário já autenticado" é escopo
 * futuro de ADM-004) — por isso este harness não precisa de nenhum mock
 * de API, diferente do harness de `e2e-visual` (o Dashboard exige
 * `page.route()` para a chamada de sessão).
 *
 * Sem autenticação e sem exercitar o submit do formulário de login — isso
 * é escopo de UXQ-002, não desta tarefa.
 *
 * A prova de DETECÇÃO de uma violação axe deliberada vive só no harness
 * do FastCompre (`apps/fastcompre/e2e-a11y/home.a11y.spec.ts`), por
 * decisão do PO: um único cenário de detecção é suficiente para o
 * critério de aceite da UXQ-001. Este spec prova a outra metade do
 * escopo normativo ("configuração de execução contra build real — Admin
 * e FastCompre"): que o harness roda e reporta corretamente também no
 * Admin.
 */

/**
 * CORREÇÃO (rodada de validação local, PO) — a varredura irrestrita
 * (`new AxeBuilder({ page }).analyze()`, sem filtro de tags) falhava em
 * `/login` por `page-has-heading-one` (impacto moderate). Confirmado
 * lendo diretamente o `axe-core@4.13.0` efetivamente instalado (a versão
 * resolvida por `@axe-core/playwright@4.13.0` no `pnpm-lock.yaml`):
 * `page-has-heading-one` tem `tags: ['cat.semantics', 'best-practice']`
 * — nenhum tag `wcagXX`, ou seja, não corresponde a nenhum critério de
 * sucesso WCAG, é só uma recomendação de boa prática do próprio axe-core.
 * UXQ-001 é scaffold/gate de acessibilidade NORMATIVA (WCAG 2.2 AA), não
 * remediação de UI — `/login` não foi alterado por esta correção.
 *
 * `WCAG_AA_CUMULATIVE_TAGS` restringe a varredura aos tags que o
 * `axe-core@4.13.0` instalado efetivamente define para nível A/AA
 * cumulativo (2.0 + 2.1 + 2.2) — confirmado inspecionando o bundle
 * instalado, não por suposição: os únicos tags de NÍVEL que existem nessa
 * versão são `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`, `wcag21aa` e
 * `wcag22aa` (não existe `wcag22a` — a WCAG 2.2 não introduziu nenhum
 * critério de Nível A novo, só AA/AAA; os demais `wcag2NN`/`wcag21N`
 * encontrados no bundle são referências a critérios individuais, não a
 * níveis). `wcag2aaa`/`wcag21aaa` (Nível AAA) ficam de fora deliberadamente
 * — não fazem parte do requisito normativo AA desta tarefa.
 *
 * Mesma política aplicada em `apps/fastcompre/e2e-a11y/home.a11y.spec.ts`
 * — ver comentário equivalente lá.
 */
const WCAG_AA_CUMULATIVE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('UXQ-001 — a11y smoke (Admin)', () => {
  test('/login carrega via build real e não reporta violação axe', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('E-mail')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
