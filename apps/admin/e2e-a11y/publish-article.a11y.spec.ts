import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import { SITE_SLUG, articleFixture, mockArticleDetail, mockMe, mockPublishTransition } from './fixtures';

/**
 * UXQ-002 — Cenário 3/3 (publicar Artigo), cobertura em browser real do
 * fluxo crítico "publicar Artigo" do Admin (backlog:
 * `UX-Implementation-Backlog.md`, UXQ-002).
 *
 * Parte de um Artigo mockado já em `PENDING_REVIEW` (nunca `DRAFT`): a
 * transição `publish` só existe nesse status
 * (`ACTIONS_BY_STATUS.PENDING_REVIEW`, `article-transition-panel.tsx`) —
 * começar de `DRAFT` exigiria uma transição extra (`submit-for-review`)
 * fora do escopo deste cenário. `PENDING_REVIEW`/`PUBLISHED` caem na
 * composição read-only de `ArticleDetail` (`!isDraft`), que NUNCA monta
 * `ProductLookupProvider`/`ArticleForm` — confirmado lendo
 * `article-detail.tsx`, `article-read-only.tsx` e
 * `article-products-read-only.tsx`: zero autosave/dirty-state/Lexical
 * entram neste cenário (nenhum `onBeforeTransition` é passado nesta
 * composição), e nenhum mock de Categoria/Autor/catálogo de Produto é
 * necessário (diferente do cenário de criar/editar Artigo) — só
 * `GET .../articles/:id`, `.../products` (vínculos, sempre vazio aqui) e
 * `.../health`, os únicos três endpoints que esta composição de fato
 * dispara.
 *
 * Dois pontos de axe, nenhum deles só a carga inicial isolada:
 * 1. visão read-only em `PENDING_REVIEW`, com a ação "Publicar" visível;
 * 2. visão read-only em `PUBLISHED`, alcançada só DEPOIS de um clique
 *    real em "Publicar" que dispara um `POST` (mockado) para
 *    `.../articles/:id/publish` e re-renderiza com a ação "Arquivar" —
 *    ponto pós-interação.
 *
 * Fidelidade à máquina de estados (decisão do PO): `mockPublishTransition`
 * devolve uma ÚNICA resposta fixa e realista, com o mesmo shape de
 * `articleAdminSchema` que a API real devolveria — nunca um estado
 * inventado no front-end. `ArticleDetail.handleTransition` só substitui
 * `state.article` pelo que a API (aqui, o mock) devolveu; o front-end não
 * decide por conta própria que o Artigo está `PUBLISHED`. Nenhuma
 * correção de UI foi feita a partir de achados aqui.
 */
test.describe('UXQ-002 — a11y: fluxo de publicar Artigo (Admin)', () => {
  test('visão PENDING_REVIEW com "Publicar" e visão PUBLISHED após transição mockada não reportam violação axe', async ({
    page,
  }) => {
    const pendingReviewArticle = articleFixture({ status: 'PENDING_REVIEW' });
    const publishedArticle = articleFixture({
      status: 'PUBLISHED',
      publishedAt: '2026-01-11T10:00:00.000Z',
    });

    await mockMe(page);
    await mockArticleDetail(page, pendingReviewArticle);
    await mockPublishTransition(page, publishedArticle);

    // --- Ponto de axe 1/2: PENDING_REVIEW, ação "Publicar" disponível ---
    await page.goto(`/${SITE_SLUG}/articles/${pendingReviewArticle.id}`);
    await expect(page.getByRole('button', { name: 'Publicar' })).toBeVisible();

    const pendingReviewResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(pendingReviewResults.violations, JSON.stringify(pendingReviewResults.violations, null, 2)).toEqual([]);

    // --- Transição real (mockada): publicar → re-render com "Arquivar" ---
    await page.getByRole('button', { name: 'Publicar' }).click();

    // --- Ponto de axe 2/2: PUBLISHED, ação "Arquivar" disponível ---
    await expect(page.getByRole('button', { name: 'Arquivar' })).toBeVisible();

    const publishedResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(publishedResults.violations, JSON.stringify(publishedResults.violations, null, 2)).toEqual([]);
  });
});
