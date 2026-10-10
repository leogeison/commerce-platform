import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WCAG_AA_CUMULATIVE_TAGS } from './wcag-tags';
import {
  ARTICLE_ID,
  SITE_SLUG,
  articleFixture,
  mockArticleDetail,
  mockCreateArticle,
  mockEmptyCategoriesAndAuthors,
  mockEmptyProductCatalog,
  mockMe,
} from './fixtures';

/**
 * UXQ-002 — Cenário 2/3 (criar/editar Artigo), cobertura em browser real
 * do fluxo crítico "criar/editar Artigo" do Admin (backlog:
 * `UX-Implementation-Backlog.md`, UXQ-002: criar e editar tratados como
 * UM único cenário, não separados artificialmente — decisão do PO).
 *
 * Dois pontos de axe, nenhum deles só a carga inicial isolada:
 * 1. `/articles/new` — formulário vazio (`create-article.tsx`,
 *    `EMPTY_VALUES`);
 * 2. `/articles/:id` — formulário DRAFT populado, alcançado só DEPOIS de
 *    um `POST` real (mockado) de criação e do redirect que ele dispara
 *    (`CreateArticle.handleSubmit` → `router.replace(/:siteSlug/articles/:id)`)
 *    — ponto pós-interação, prova a composição de EDIÇÃO (mesmo
 *    `ArticleForm`, agora com `initialValues` vindos do Artigo recém-
 *    criado) sem precisar de um segundo fluxo de "editar" separado.
 *
 * Escopo mínimo deliberado (sem cobertura adicional por conveniência):
 * `createArticleRequestSchema` só exige `type`/`title`/`slug`
 * (confirmado em `packages/contracts/.../create-article-request.ts`) —
 * por isso só Título e Slug são preenchidos aqui; nenhuma interação com
 * Lexical (corpo do Artigo), `ProductBlock`, Categoria, Autor ou capa.
 * `ProductLookupProvider` com `articleId: null` em `/articles/new` nunca
 * dispara busca de catálogo (doc comment de `create-article.tsx`) — por
 * isso `mockEmptyProductCatalog` só importa de fato depois do redirect
 * para `/articles/:id`, mesmo registrado antes do primeiro `goto` (nenhum
 * `page.route()` é exercitado antes de existir uma requisição real para
 * ele).
 *
 * Mocks via `page.route()` (nunca backend/DB real): sessão (`mockMe`),
 * catálogo de Categoria/Autor vazios (exigidos por `ArticleForm` nas duas
 * rotas), criação (`mockCreateArticle`, resposta fixa e realista — nunca
 * refletindo o texto digitado) e o Artigo resultante
 * (`mockArticleDetail`, com `productIds: []`). O frontend nunca inventa
 * nenhum dado do Artigo: tudo que aparece na tela populada vem da
 * resposta mockada da própria API. Nenhuma correção de UI foi feita a
 * partir de achados aqui.
 *
 * CORREÇÃO (rodada de validação local, PO) — `page.getByLabel('Título')`
 * é ambíguo: `getByLabel` casa por substring (sem `exact`) e o acessível
 * `listbox` do menu `/` do editor Lexical (`article-body-slash-menu.tsx`)
 * permanece montado no DOM (ver doc comment daquele arquivo — "o
 * `listbox` permanece montado" mesmo sem resultado/fechado), com opções
 * "Título 1"/"Título 2"/"Título 3" — todas batem com a substring
 * "Título". Troquei para `page.getByRole('textbox', { name: 'Título',
 * exact: true })`: `role="textbox"` já exclui por construção as opções
 * do `listbox` (`role="option"`, confirmado em
 * `article-body-slash-menu.tsx`), e `exact: true` remove qualquer
 * ambiguidade remanescente por substring. Nenhuma alteração na UI/editor
 * — o locator do teste é o único ponto corrigido.
 */
test.describe('UXQ-002 — a11y: fluxo de criar/editar Artigo (Admin)', () => {
  test('formulário vazio em /articles/new e formulário populado em /articles/:id após criação não reportam violação axe', async ({
    page,
  }) => {
    const createdArticle = articleFixture({
      title: 'Guia de fones bluetooth',
      slug: 'guia-fones-bluetooth',
    });

    await mockMe(page);
    await mockEmptyCategoriesAndAuthors(page);
    await mockEmptyProductCatalog(page);
    await mockCreateArticle(page, createdArticle);
    await mockArticleDetail(page, createdArticle);

    // --- Ponto de axe 1/2: formulário vazio em /articles/new ---
    await page.goto(`/${SITE_SLUG}/articles/new`);
    await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Criar' })).toBeVisible();

    const emptyFormResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(emptyFormResults.violations, JSON.stringify(emptyFormResults.violations, null, 2)).toEqual([]);

    // --- Transição real (mockada): criar → redirect → composição de edição ---
    await page.getByRole('textbox', { name: 'Título', exact: true }).fill(createdArticle.title);
    await page.getByLabel('Slug').fill(createdArticle.slug);
    await page.getByRole('button', { name: 'Criar' }).click();

    await expect(page).toHaveURL(new RegExp(`/${SITE_SLUG}/articles/${ARTICLE_ID}$`));

    // --- Ponto de axe 2/2: formulário DRAFT populado em /articles/:id ---
    await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(createdArticle.title);
    await expect(page.getByLabel('Slug')).toHaveValue(createdArticle.slug);

    const editFormResults = await new AxeBuilder({ page }).withTags(WCAG_AA_CUMULATIVE_TAGS).analyze();
    expect(editFormResults.violations, JSON.stringify(editFormResults.violations, null, 2)).toEqual([]);
  });
});
