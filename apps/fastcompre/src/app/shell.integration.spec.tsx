import type { ContextType, ReactElement } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
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
 * Restrição técnica descoberta e preservada aqui: TODO o cenário roda
 * dentro de um único `it()`, com um único ciclo `jest.doMock` + `import()`
 * dinâmico, e SEM `jest.resetModules()` entre a montagem inicial e o
 * `rerender()` que representa a navegação concluída. `jest.resetModules()`
 * limpa o registro de módulos do Jest; uma reimportação dinâmica de
 * `SiteHeader` feita DEPOIS disso (para variar mocks entre casos, como
 * `site-header.spec.tsx` faz) traria uma cópia de `next/link`/`react`
 * diferente da que `@testing-library/react` (importado estaticamente no
 * topo deste arquivo) já está usando — confirmado experimentalmente:
 * produz "Invalid hook call" ao tentar `render()`/`rerender()` a árvore
 * resultante. Por isso este spec usa um único conjunto de dados/mocks para
 * o cenário inteiro, em vez do padrão de "um `doMock` por `it()`" usado em
 * `site-header.spec.tsx` — coerente com o próprio backlog, que pede UM
 * cenário de integração, não uma matriz de variações.
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
 * novo: duas Categorias (mesmas de `category-nav.spec.tsx`) e nenhum
 * Artigo (a Home já trata lista vazia como estado válido, coberto por
 * `page.spec.tsx`; não é o foco deste cenário).
 *
 * Não modifica nenhum dos 10 specs históricos `node`/`renderToStaticMarkup`
 * identificados na investigação da UXW-005, nenhum spec unitário existente
 * do shell, nem extrai nenhum helper compartilhado/test-utils — decisão
 * explícita desta tarefa.
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

function Providers({ pathname, children }: { pathname: string; children: ReactElement }) {
  return (
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>{children}</PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>
  );
}

describe('Shell público — integração (SiteHeader + Home + SiteFooter)', () => {
  it('carrega a composição real, abre o menu mobile, navega para uma Categoria e reflete a navegação concluída', async () => {
    jest.doMock('../lib/public-api/client', () => ({
      listPublicCategories: jest.fn(() => Promise.resolve(CATEGORIES)),
      listPublicArticles: jest.fn(() => Promise.resolve(ARTICLES)),
    }));
    jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));

    const [{ SiteHeader }, { default: Home }, { SiteFooter }] = await Promise.all([
      import('./site-header'),
      import('./page'),
      import('./site-footer'),
    ]);

    // Server Components `async` resolvidos para elementos React reais
    // (não HTML estático) — ver comentário acima.
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
});
