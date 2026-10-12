import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resetFixtureState } from '../e2e-visual/fixture-state-control';
import {
  AFFILIATE_REDIRECT_URL,
  ARTICLE_ID,
  ARTICLE_SLUG,
  ARTICLE_TITLE,
  CATEGORY_NAME,
  CATEGORY_SLUG,
  OFFER_ID,
  SITE_SLUG,
} from '../e2e-visual/fixtures.mjs';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';

/**
 * UXQ-003 — Cenário de acessibilidade camada 2 (FastCompre): fluxo crítico
 * público completo Home → Categoria → Artigo → clique de afiliado
 * (backlog: `UX-Implementation-Backlog.md`, UXQ-003; pré-requisitos
 * UXQ-001/UXW-016, ambos já concluídos). Decisão do PO: um único cenário
 * completo, não fragmentado em specs por trecho de fluxo.
 *
 * Três pontos de axe, cada um o estado real alcançado por navegação real
 * do usuário — nunca `page.goto()` direto para "economizar" um passo:
 * 1. Home (estado populado, mesma fixture de `home.a11y.spec.ts`/UXQ-001);
 * 2. Categoria, DEPOIS do clique real no link de Categoria do header
 *    (`category-nav.tsx`, `<nav aria-label="Categorias">` persistente —
 *    nunca o `<dialog>` mobile, fechado e fora da árvore de acessibilidade
 *    neste viewport 1440×900 `sm+`, confirmado por leitura direta do
 *    componente: decisão de desenho que evita a mesma ambiguidade de
 *    locator encontrada na correção da UXQ-002);
 * 3. Artigo, DEPOIS do clique real no link do card de Artigo listado na
 *    Categoria (mesmo locator/precedente de `category.visual.spec.ts`).
 *
 * Um quarto ponto de axe pós-fechamento do popup do CTA de afiliado foi
 * avaliado e rejeitado (decisão do PO): a página de origem (Artigo) não
 * muda de composição ao abrir/fechar uma nova aba — reportar axe ali seria
 * redundante com o ponto 3. Em seu lugar, o clique de afiliado é provado
 * por assertions explícitas da cadeia real de rede, nunca por axe.
 *
 * Cadeia de redirecionamento de afiliado — simulação fiel da resposta
 * PÚBLICA do endpoint real (Architecture.md §20, "Fluxo de Tracking":
 * `GET /r/:siteSlug/:offerId?articleId=...` → 302 → `affiliateUrl` real),
 * nunca uma reimplementação ou alteração de `apps/api`/tracking/
 * validação/tenancy/rate limit/redirect safety — só o client observável:
 * 1. a interceptação é registrada no `BrowserContext` ANTES do clique,
 *    porque o CTA abre uma aba nova (`target="_blank"`) e a requisição de
 *    navegação acontece nessa nova `Page`, que só existe depois do clique;
 * 2. o clique é no `<a>` real do CTA (`rel="sponsored nofollow noopener
 *    noreferrer"`, único na página — exatamente uma Oferta em estoque na
 *    fixture, `OFFER_ID`/`AMAZON_BR`) — nunca substituído por
 *    `page.goto()`, que não provaria que o `href` real do DOM está
 *    correto;
 * 3. a popup real é capturada via `page.waitForEvent('popup')`, armado
 *    ANTES do clique, concorrente com ele (`Promise.all`);
 * 4. a requisição interceptada é confirmada como EXATAMENTE
 *    `${AFFILIATE_REDIRECT_URL}r/${SITE_SLUG}/${OFFER_ID}?articleId=${ARTICLE_ID}`
 *    — a mesma URL que `affiliateRedirectHref` monta
 *    (`affiliate-redirect-href.ts`), nunca uma URL aproximada (o
 *    predicado de rota usa igualdade exata de string, não glob/regex);
 * 5. essa requisição é respondida com um `302` real (`route.fulfill`,
 *    `status: 302`, header `location`) — nunca um `200` plano, que não
 *    provaria que o front-end segue um redirect de verdade. O destino do
 *    `location` é a própria origem do FastCompre já servida de verdade
 *    pelo `webServer` deste harness (fixture `baseURL` do Playwright,
 *    que reflete `use.baseURL`/`FASTCOMPRE_BASE_URL` do
 *    `playwright.config.ts`, sem hardcode de porta) — não um destino
 *    mockado: o navegador segue o `302` até um servidor REAL já de pé
 *    para este teste, então não existe nenhuma segunda interceptação a
 *    manter nem nenhuma rede externa envolvida em nenhum momento;
 * 6. a popup é confirmada como tendo chegado de fato a essa URL
 *    (`popup.url()`), provando que o navegador seguiu o `302` — não só
 *    que a requisição foi disparada;
 * 7. a popup é fechada.
 *
 * Nenhuma correção de UI foi feita a partir de achados aqui: qualquer
 * violação axe encontrada seria reportada, classificada e aguardaria
 * decisão antes de qualquer correção de código de produto.
 */

const EXPECTED_TRACKING_URL = `${AFFILIATE_REDIRECT_URL}r/${SITE_SLUG}/${OFFER_ID}?articleId=${ARTICLE_ID}`;

test.describe('UXQ-003 — a11y: fluxo público crítico (FastCompre)', () => {
  test('Home → Categoria → Artigo → clique de afiliado não reporta violação axe e segue a cadeia real de redirecionamento', async ({
    page,
    context,
    baseURL,
  }) => {
    await resetFixtureState('populated');

    // --- Ponto de axe 1/3: Home ---
    await page.goto('/');
    await expect(page.getByRole('link', { name: ARTICLE_TITLE })).toBeVisible();

    const homeResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(homeResults.violations, JSON.stringify(homeResults.violations, null, 2)).toEqual([]);

    // --- Navegação real: Home → Categoria (link do header, nunca page.goto()) ---
    // CORREÇÃO (rodada de validação local, PO): `getByRole('link', { name:
    // CATEGORY_NAME })` sozinho é ambíguo — o mesmo texto "Fones Bluetooth"
    // existe também como link no rodapé (`site-footer.tsx`,
    // `<nav aria-label="Categorias no rodapé">`), landmark distinto do
    // header (`<nav aria-label="Categorias">`, `category-nav.tsx`). Escopo
    // explícito pelo landmark do header (nome acessível exato) resolve a
    // ambiguidade sem recorrer a `.first()` (que esconderia a causa real) e
    // sem qualquer alteração de UI.
    await page
      .getByRole('navigation', { name: 'Categorias', exact: true })
      .getByRole('link', { name: CATEGORY_NAME, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${CATEGORY_SLUG}$`));

    // --- Ponto de axe 2/3: Categoria ---
    await expect(page.getByRole('heading', { level: 1, name: CATEGORY_NAME })).toBeVisible();

    const categoryResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(categoryResults.violations, JSON.stringify(categoryResults.violations, null, 2)).toEqual([]);

    // --- Navegação real: Categoria → Artigo (link do card, nunca page.goto()) ---
    await page.getByRole('link', { name: ARTICLE_TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`/${CATEGORY_SLUG}/${ARTICLE_SLUG}$`));

    // --- Ponto de axe 3/3: Artigo ---
    await expect(page.getByRole('heading', { level: 1, name: ARTICLE_TITLE })).toBeVisible();

    const articleResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(articleResults.violations, JSON.stringify(articleResults.violations, null, 2)).toEqual([]);

    // --- URL de destino do redirect: a própria origem do FastCompre já
    // servida de verdade pelo webServer deste harness — derivada da
    // fixture `baseURL` do Playwright (reflete `use.baseURL` do
    // playwright.config.ts), nunca uma porta hardcoded. Como é um servidor
    // real já de pé, não precisa de nenhuma segunda interceptação: o
    // navegador recebe uma resposta de verdade ao seguir o 302. ---
    const controlledDestinationUrl = new URL('/', baseURL).toString();

    // --- Cadeia de redirecionamento de afiliado: interceptação registrada
    // no BrowserContext, ANTES do clique (a navegação real acontece na aba
    // nova que o clique abre, nunca na `page` atual). Predicado de rota por
    // igualdade exata de string (nunca glob/regex aproximado). ---
    let trackingRequestUrl: string | undefined;

    await context.route(
      (url) => url.toString() === EXPECTED_TRACKING_URL,
      async (route) => {
        trackingRequestUrl = route.request().url();
        await route.fulfill({ status: 302, headers: { location: controlledDestinationUrl } });
      },
    );

    // --- CTA real do afiliado: único <a> com este rel na página (exatamente
    // uma Oferta em estoque na fixture) — href conferido contra a MESMA URL
    // esperada da cadeia de rede, antes de confiar no clique. ---
    const affiliateCta = page.locator('a[rel="sponsored nofollow noopener noreferrer"]');
    await expect(affiliateCta).toHaveCount(1);
    await expect(affiliateCta).toHaveAttribute('href', EXPECTED_TRACKING_URL);

    // --- Clique real no CTA (nunca page.goto()); popup real capturada,
    // `waitForEvent('popup')` armado antes do clique ---
    const [popup] = await Promise.all([page.waitForEvent('popup'), affiliateCta.click()]);

    await popup.waitForLoadState('load');

    // --- Confirma a cadeia completa: requisição exata → 302 → destino real
    // de fato alcançado pela popup (nunca só "a requisição saiu") ---
    expect(trackingRequestUrl).toBe(EXPECTED_TRACKING_URL);
    expect(popup.url()).toBe(controlledDestinationUrl);

    await popup.close();
  });
});
