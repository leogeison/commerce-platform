import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import { mockEmptyCategoriesAndAuthors, mockEmptyDashboardSections, mockLogin, mockMe } from './fixtures';

/**
 * UXQ-001 — prova mínima de infraestrutura no Admin: harness Playwright +
 * axe-core contra build real (nunca `next dev`).
 *
 * `/login` foi escolhida por ser rota estável e pública: `login/page.tsx`
 * é Server Component puro, sem fetch e sem guarda de sessão (o próprio
 * arquivo documenta que a guarda de "usuário já autenticado" é escopo
 * futuro de ADM-004) — por isso este teste não precisa de nenhum mock
 * de API, diferente do harness de `e2e-visual` (o Dashboard exige
 * `page.route()` para a chamada de sessão).
 *
 * A prova de DETECÇÃO de uma violação axe deliberada vive só no harness
 * do FastCompre (`apps/fastcompre/e2e-a11y/home.a11y.spec.ts`), por
 * decisão do PO: um único cenário de detecção é suficiente para o
 * critério de aceite da UXQ-001. Este teste prova a outra metade do
 * escopo normativo ("configuração de execução contra build real — Admin
 * e FastCompre"): que o harness roda e reporta corretamente também no
 * Admin.
 *
 * `WCAG_AA_CUMULATIVE_TAGS` foi extraído para `./wcag-tags.ts` na UXQ-002
 * (ver doc comment lá) — mesma constante, mesma política, só centralizada
 * porque este arquivo deixou de ser o único spec do Admin.
 */

/**
 * UXQ-002 — Cenário 1/3 (Login), cobertura em browser real do fluxo
 * crítico "login" do Admin (backlog: `UX-Implementation-Backlog.md`,
 * UXQ-002). Dois pontos de axe adicionados a este mesmo cenário, além da
 * carga inicial já provada acima pela UXQ-001 — "não apenas na carga
 * inicial" (decisão do PO):
 *
 * 1. estado de erro de credencial (`POST /admin/auth/login` mockado
 *    `401`, mensagem exibida via `role="alert"`, `resolveErrorMessage`
 *    em `login-form.tsx`) — ponto pós-interação, nunca carga inicial;
 * 2. landing autenticado no Dashboard após sucesso mockado — a cadeia
 *    real `login-form.tsx` (`router.replace('/')`) → `home.tsx`
 *    (`GET /admin/auth/me`, `sites.length === 1` → redirect automático
 *    para `/:siteSlug`) → `authenticated-shell.tsx`/`topbar.tsx` (mesma
 *    sessão mockada, reaproveitada pelos três consumidores via um único
 *    `page.route()`) → Dashboard (UXA-017/018, três seções vazias,
 *    estado vazio é suficiente para esta prova — nenhum dado de Artigo é
 *    exigido pelo cenário de Login em si).
 *
 * Nunca autentica contra o backend real: toda a cadeia acima é
 * inteiramente mockada via `page.route()` (`mockMe`/`mockLogin`/
 * `mockEmptyDashboardSections`/`mockEmptyCategoriesAndAuthors` —
 * `categories`/`authors` vazios porque a sidebar/command palette da
 * shell autenticada não dependem deles, mas registrá-los de antemão
 * evita qualquer requisição não interceptada caso o usuário navegue para
 * além do Dashboard, o que este teste não faz). Role/tenancy/isolamento
 * de Site não são alterados nem exercitados de fato — é sempre resposta
 * mockada no front-end, nunca sessão real. Nenhuma correção de UI foi
 * feita a partir de achados aqui: qualquer violação encontrada seria
 * reportada antes de qualquer correção de produto.
 */
test.describe('UXQ-002 — a11y: fluxo de Login (Admin)', () => {
  test('/login carrega via build real e não reporta violação axe', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('E-mail')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('estado de erro de credencial inválida (401 mockado) não reporta violação axe', async ({ page }) => {
    await mockLogin(page, 'invalid-credentials');

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('equipe.editorial@fastcompre.test');
    await page.getByLabel('Senha').fill('senha-incorreta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const errorMessage = page.getByRole('alert').filter({ hasText: 'Credenciais inválidas.' });
    await expect(errorMessage).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('landing autenticado no Dashboard após login mockado não reporta violação axe', async ({ page }) => {
    await mockMe(page);
    await mockLogin(page, 'success');
    await mockEmptyDashboardSections(page);
    await mockEmptyCategoriesAndAuthors(page);

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('equipe.editorial@fastcompre.test');
    await page.getByLabel('Senha').fill('senha-correta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Confirma que a cadeia real (login → `/` → redirect automático de
    // Site único → `/:siteSlug`) de fato chegou ao Dashboard, não só que
    // o formulário parou de submeter.
    await expect(page).toHaveURL(/\/fastcompre$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
