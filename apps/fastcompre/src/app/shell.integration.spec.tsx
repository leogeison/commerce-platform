import type { ContextType, ReactElement } from 'react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { PublicCategory, ListPublicArticlesResponse } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/shell.integration.spec.tsx
 *
 * UXW-005 — cenário de integração do shell público (UX-Implementation-
 * Backlog.md, UXW-005): "carregar página → abrir menu mobile → navegar
 * para Categoria". Fecha a parte de teste de E9, consolidando numa única
 * árvore interativa o que `site-header.spec.tsx`, `page.spec.tsx`,
 * `site-footer.spec.tsx` e `category-nav.spec.tsx` já provam isoladamente.
 *
 * O que este spec prova — e o que ele NÃO prova: ele monta `SiteHeader`,
 * `Home` e `SiteFooter` (componentes reais de produção, sem nenhuma
 * reescrita/duplicação de markup) como uma única árvore React interativa
 * e exercita o comportamento de ponta a ponta descrito no backlog. A
 * ÁRVORE em si é composta por este próprio teste (`<>{header}{home}
 * <SiteFooter /></>`), não por `layout.tsx` — este spec não é prova de que
 * `RootLayout` compõe o shell corretamente; essa composição real (server-
 * side, via `<html>`/`<body>`) continua coberta pelos specs existentes de
 * `SiteHeader`/`SiteFooter`, que este spec não modifica. O que ele prova é
 * a integração COMPORTAMENTAL dos componentes reais do shell funcionando
 * juntos numa árvore montada de verdade (não HTML estático), algo que
 * nenhum spec unitário isolado consegue provar sozinho.
 *
 * Viabilidade técnica confirmada empiricamente antes desta implementação
 * (fora do repositório, num protótipo descartável, nunca commitado): tanto
 * `SiteHeader` quanto `Home` são Server Components `async`; chamar
 * `await SiteHeader()` / `await Home()` diretamente (sem `<SiteHeader />`
 * como JSX, pelo mesmo motivo já documentado em `site-header.spec.tsx`)
 * retorna um ELEMENTO REACT de verdade (`$$typeof ===
 * Symbol(react.transitional.element)`), não uma string HTML — diferente de
 * `renderToStaticMarkup(await SiteHeader())`, que os specs unitários usam
 * porque só precisam da estrutura estática. Passar esses elementos para
 * `render()` do Testing Library monta a árvore de verdade, preservando
 * hooks/handlers do `CategoryNav` real aninhado dentro do `SiteHeader`
 * (verificado: abrir/fechar do `<dialog>`, foco inicial via `autoFocus`,
 * `aria-expanded`, tudo funciona sem nenhum polyfill ou mock adicional
 * além dos já usados nos specs unitários).
 *
 * Restrição técnica descoberta e preservada aqui: `jest.doMock` + a
 * importação dinâmica de `SiteHeader`/`Home`/`SiteFooter` rodam UMA ÚNICA
 * VEZ para todo o arquivo (`beforeAll`, abaixo) — nunca `jest.resetModules()`
 * em lugar nenhum. Motivo confirmado empiricamente (tanto nesta tarefa
 * quanto na UXW-005 original): `@testing-library/react` é importado
 * estaticamente no topo deste arquivo, uma única vez; `jest.resetModules()`
 * — em QUALQUER ponto, não só no meio de uma árvore já montada — limpa o
 * registro de módulos do Jest, e uma reimportação dinâmica de `SiteHeader`
 * feita depois (para variar mocks entre casos, como `site-header.spec.tsx`
 * faz) traz uma cópia de `next/link`/`react` diferente da que
 * `@testing-library/react` já está usando, produzindo "Invalid hook call"
 * (`useContext` retornando `null`) ao montar/renderizar a árvore resultante
 * — reproduzido nesta própria tarefa ao tentar um segundo `it()` com seu
 * próprio `jest.doMock`+`import()` isolado por `jest.resetModules()` entre
 * testes. Por isso o cenário inteiro do arquivo (os dois `it()`s)
 * compartilha a MESMA importação de `SiteHeader`/`Home`/`SiteFooter`
 * (feita uma vez em `beforeAll`) e varia dados entre casos alterando o
 * valor resolvido de `mockListPublicCategories`/`mockListPublicArticles`
 * (`jest.fn()` compartilhados, declarados no escopo do módulo) antes de
 * cada `render()` — não reimportando nada.
 *
 * Mocks mínimos, mesmo padrão já usado nos specs unitários: API pública
 * (`listPublicCategories`/`listPublicArticles`, via `jest.doMock` — não
 * `jest.mock()` hoistado, que não funciona sob o transform SWC do
 * `next/jest` deste projeto, mesmo motivo já documentado em
 * `site-header.spec.tsx`/`page.spec.tsx`) e `next/server` (`connection()`,
 * que `Home` aguarda antes de renderizar). Providers de router/pathname
 * são os mesmos três já usados em `category-nav.spec.tsx`
 * (`RouterContext`/`AppRouterContext`/`PathnameContext`).
 *
 * Dados mínimos, coerentes com os contratos existentes (`PublicCategory`,
 * `ListPublicArticlesResponse`) — sem inventar nenhum estado funcional
 * novo: duas Categorias (mesmas de `category-nav.spec.tsx`); `ARTICLES`
 * (vazio) para o cenário original (a Home já trata lista vazia como estado
 * válido, coberto por `page.spec.tsx`; não era o foco daquele cenário) e
 * `POPULATED_ARTICLES` (um Artigo real, com imagem e resumo) para o gate
 * de acessibilidade da UXW-007, abaixo.
 *
 * Não modifica nenhum dos 10 specs históricos `node`/`renderToStaticMarkup`
 * identificados na investigação da UXW-005, nenhum spec unitário existente
 * do shell, nem extrai nenhum helper compartilhado/test-utils — decisão
 * explícita daquela tarefa, preservada aqui.
 *
 * UXW-007 — segundo `it()` adicionado: `shell.integration.spec.tsx` só
 * cobria `jest-axe` com a Home vazia (ajuste explicitamente pedido na
 * aprovação da UXW-007) — o novo teste roda `jest-axe` sobre a composição
 * real (Header + Home + Footer) com a Home populada por um Artigo real,
 * garantindo que o card novo (estrutura `<article>`/`<li>`, `<h2>`, link
 * único envolvendo o card, `alt=""` na imagem, resumo/data) participa
 * efetivamente da análise. O cenário original (primeiro `it()`) não foi
 * alterado em comportamento/asserções — só a forma como os módulos são
 * importados mudou, para os dois `it()`s poderem compartilhar a mesma
 * importação sem `jest.resetModules()` (ver parágrafo acima).
 */
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

const mockLegacyRouter = {
  pathname: '/',
  asPath: '/',
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const CATEGORIES: PublicCategory[] = [
  { name: 'Comparativos', slug: 'comparativos' },
  { name: 'Cafeteiras', slug: 'cafeteiras' },
];

const ARTICLES: ListPublicArticlesResponse = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

// UXW-007 — um Artigo real (com `coverImageUrl` e `metaDescription`), só
// para o teste de acessibilidade com Home populada abaixo. `ARTICLES`
// (vazio, acima) continua servindo o cenário original, sem alteração.
const POPULATED_ARTICLES: ListPublicArticlesResponse = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      categorySlug: 'comparativos',
      type: 'COMPARISON',
      title: 'Melhor fone bluetooth 2026',
      slug: 'melhor-fone-bluetooth',
      metaDescription: 'Comparativo dos melhores fones bluetooth.',
      coverImageUrl: 'https://example.com/cover.jpg',
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function Providers({ pathname, children }: { pathname: string; children: ReactElement }) {
  return (
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>{children}</PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>
  );
}

// `jest.fn()` compartilhados entre os dois `it()`s — cada teste só muda o
// valor resolvido (`mockResolvedValue`) antes de renderizar, nunca
// reimporta nada. Ver comentário no topo do arquivo.
const mockListPublicCategories = jest.fn<() => Promise<PublicCategory[]>>();
const mockListPublicArticles = jest.fn<() => Promise<ListPublicArticlesResponse>>();

let SiteHeader: (typeof import('./site-header'))['SiteHeader'];
let Home: (typeof import('./(home)/page'))['default'];
let SiteFooter: (typeof import('./site-footer'))['SiteFooter'];

beforeAll(async () => {
  jest.doMock('../lib/public-api/client', () => ({
    listPublicCategories: mockListPublicCategories,
    listPublicArticles: mockListPublicArticles,
  }));
  jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));

  // UXW-007 — `page.tsx` da Home moveu para o Route Group `(home)/` (isola
  // `loading.tsx`/`error.tsx` da Home sem afetar Categoria/Artigo);
  // `(home)` não aparece na URL, só no caminho do arquivo.
  ({ SiteHeader } = await import('./site-header'));
  ({ default: Home } = await import('./(home)/page'));
  ({ SiteFooter } = await import('./site-footer'));
});

describe('Shell público — integração (SiteHeader + Home + SiteFooter)', () => {
  it('carrega a composição real, abre o menu mobile, navega para uma Categoria e reflete a navegação concluída', async () => {
    mockListPublicCategories.mockResolvedValue(CATEGORIES);
    mockListPublicArticles.mockResolvedValue(ARTICLES);

    // Server Components `async` resolvidos para elementos React reais
    // (não HTML estático) — ver comentário no topo do arquivo.
    const header = await SiteHeader();
    const home = await Home();

    const { rerender, container } = render(
      <Providers pathname="/">
        <>
          {header}
          {home}
          <SiteFooter />
        </>
      </Providers>,
    );

    // 1/2 — carregar página: Header (wordmark + menu de Categorias),
    // conteúdo da Home e divulgação de afiliação do Footer, todos
    // presentes na mesma árvore.
    expect(screen.getByRole('link', { name: 'FastCompre' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Categorias' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'FastCompre' })).toBeTruthy();
    expect(
      screen.getByText(
        'Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.',
      ),
    ).toBeTruthy();

    // 3 — drawer inicialmente fechado.
    const trigger = screen.getByRole('button', { name: 'Categorias' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();

    // 6/12 — jest-axe limpo com o shell fechado (estado inicial).
    expect(await axe(container)).toHaveNoViolations();

    // 4/5 — abrir "Categorias" via userEvent: drawer aberto, com os links
    // reais das Categorias.
    const user = userEvent.setup();
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Categorias' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const closeButton = within(dialog).getByRole('button', { name: 'Fechar' });
    expect(document.activeElement).toBe(closeButton);

    const categoryLink = within(dialog).getByRole('link', { name: 'Comparativos' });
    expect(categoryLink.getAttribute('href')).toBe('/comparativos');
    expect(within(dialog).getByRole('link', { name: 'Cafeteiras' }).getAttribute('href')).toBe('/cafeteiras');

    // 6/12 — jest-axe limpo com o drawer aberto.
    expect(await axe(container)).toHaveNoViolations();

    // 7 — clicar numa Categoria: intenção real de navegação observada no
    // router que `next/link` de fato usa neste harness (mesmos providers
    // de `category-nav.spec.tsx`) — não é uma simulação: é o próprio
    // `next/link` de produção chamando `push()` no router do contexto.
    await user.click(categoryLink);
    expect(mockLegacyRouter.push).toHaveBeenCalledWith('/comparativos', { scroll: true });

    // 8 — representar a navegação concluída: rerender da MESMA árvore
    // (mesmas instâncias de `header`/`home`, nenhuma reimportação) com o
    // pathname de destino — mesmo padrão já usado em
    // `category-nav.spec.tsx` (`rerender(buildTree(novoPathname))`).
    rerender(
      <Providers pathname="/comparativos">
        <>
          {header}
          {home}
          <SiteFooter />
        </>
      </Providers>,
    );

    // 9 — drawer fechado após a mudança de pathname.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // 10 — Categoria de destino com aria-current="page" na navegação
    // persistente.
    const persistentNav = screen.getByRole('navigation', { name: 'Categorias' });
    expect(
      within(persistentNav).getByRole('link', { name: 'Comparativos' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(persistentNav).getByRole('link', { name: 'Cafeteiras' }).getAttribute('aria-current'),
    ).toBeNull();

    // 11 — Header/Home/Footer continuam presentes após o rerender.
    expect(screen.getByRole('link', { name: 'FastCompre' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'FastCompre' })).toBeTruthy();
    expect(
      screen.getByText(
        'Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.',
      ),
    ).toBeTruthy();

    // 12 — jest-axe limpo também no estado final (shell fechado, pathname
    // de destino).
    expect(await axe(container)).toHaveNoViolations();
  });

  /**
   * UXW-007 — gate de acessibilidade com a Home populada, na composição
   * real (Header + Home + Footer), não isolada: o cenário acima só cobre
   * `jest-axe` com a Home vazia; este cobre exatamente a lacuna apontada
   * na aprovação da tarefa, garantindo que o card novo participa da
   * análise dentro da árvore completa do shell, não só em `page.spec.tsx`.
   */
  it('não tem violação de acessibilidade (jest-axe) com a Home populada por um Artigo real', async () => {
    mockListPublicCategories.mockResolvedValue(CATEGORIES);
    mockListPublicArticles.mockResolvedValue(POPULATED_ARTICLES);

    const header = await SiteHeader();
    const home = await Home();

    const { container } = render(
      <Providers pathname="/">
        <>
          {header}
          {home}
          <SiteFooter />
        </>
      </Providers>,
    );

    const article = POPULATED_ARTICLES.items[0];

    // Escopado a `<main>` (a Home): o Header também tem `<li>`/links de
    // Categoria (nav persistente + drawer mobile), então `getByRole`
    // sem escopo encontraria múltiplos "listitem"/"link".
    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    const homeScope = within(main as HTMLElement);

    // <article>/<li> — estrutura semântica do card.
    const cardArticle = homeScope.getByRole('article');
    const listItem = homeScope.getByRole('listitem');
    expect(listItem.contains(cardArticle)).toBe(true);

    // <h2> do artigo.
    expect(homeScope.getByRole('heading', { level: 2, name: article.title })).toBeTruthy();

    // Card inteiro como link (href real de destino, não um link parcial).
    const cardLink = homeScope.getByRole('link', { name: new RegExp(article.title) });
    expect(cardLink.getAttribute('href')).toBe(`/${article.categorySlug}/${article.slug}`);
    expect(cardLink.contains(cardArticle)).toBe(true);

    // Imagem com alt="" (redundante com o título já visível no mesmo link).
    // `alt=""` remove a imagem da árvore de acessibilidade (role vira
    // "presentation") — por isso é consulta de DOM padrão
    // (`querySelector`), não `getByRole('img', ...)`, que não a
    // encontraria (o próprio objetivo do `alt=""`).
    const image = (main as HTMLElement).querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('alt')).toBe('');

    // Resumo/data, quando presentes.
    expect(homeScope.getByText(article.metaDescription as string)).toBeTruthy();
    expect(homeScope.getByText('01 de janeiro de 2026')).toBeTruthy();

    expect(await axe(container)).toHaveNoViolations();
  });
});
