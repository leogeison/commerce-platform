import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicCategory } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/site-header.spec.tsx
 *
 * UXW-001 — cobre a estrutura estática do `<SiteHeader />`. UXW-003 — o
 * componente passou a ser `async` (busca Categorias via
 * `listPublicCategories`), por isso este spec adota a mesma disciplina já
 * usada em `page.spec.tsx`/`[categorySlug]/page.spec.tsx` para componente
 * de servidor assíncrono: `jest.doMock('../lib/public-api/client', ...)` +
 * `import()` dinâmico (nunca `jest.mock()` hoistado — não funciona sob o
 * transform SWC do `next/jest` neste projeto, mesmo motivo documentado
 * naqueles specs) + `renderToStaticMarkup(await SiteHeader())` (chamar a
 * função diretamente, não `<SiteHeader />` como JSX — um componente
 * assíncrono passado como filho de outro elemento não é suportado pelos
 * renderers síncronos de `react-dom/server`, só pela própria árvore RSC do
 * Next.js em runtime real).
 *
 * `CategoryNav` (Client Component) segue sendo exercitado por
 * `renderToStaticMarkup` sem quebrar — `usePathname()` sem nenhum
 * `PathnameContext.Provider` no ar simplesmente lê o valor padrão do
 * contexto (`null`), sem lançar; o teste de `aria-current`/active state
 * fica em `category-nav.spec.tsx`, com Testing Library. Este spec só
 * confirma que `SiteHeader` decide corretamente SE `<CategoryNav>` é
 * renderizado (Categorias presentes vs. erro/lista vazia), nunca QUAL
 * item fica ativo.
 */
describe('SiteHeader', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderHeaderWith(
    categories: PublicCategory[] | (() => Promise<PublicCategory[]>),
  ): Promise<string> {
    const listPublicCategories =
      typeof categories === 'function' ? categories : () => Promise.resolve(categories);

    jest.doMock('../lib/public-api/client', () => ({ listPublicCategories }));

    // `renderToStaticMarkup` importado dinamicamente aqui, não no topo do
    // arquivo: `SiteHeader` renderiza `next/link` (wordmark) e
    // `CategoryNav` (que também usa hooks, via `usePathname()`) — ambos
    // precisam vir da MESMA cópia de `react`/`react-dom` usada por
    // `renderToStaticMarkup`, senão React lança "Invalid hook call" (duas
    // cópias de React na memória: uma do import estático original, outra
    // do registro de módulos recriado por `jest.resetModules()` antes de
    // cada `import()` dinâmico deste teste).
    const [{ renderToStaticMarkup: renderToStaticMarkupFresh }, { SiteHeader }] =
      await Promise.all([import('react-dom/server'), import('./site-header')]);
    return renderToStaticMarkupFresh(await SiteHeader());
  }

  it('renderiza um landmark <header> com o wordmark "FastCompre" como link para "/"', async () => {
    const html = await renderHeaderWith([]);

    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
  });

  it('não renderiza nenhum <h1> dentro do header', async () => {
    const html = await renderHeaderWith([]);

    expect(html).not.toMatch(/<h1[\s>]/);
  });

  it('sem Categorias (lista vazia): não renderiza <nav> — degradação graciosa', async () => {
    const html = await renderHeaderWith([]);

    expect(html).not.toMatch(/<nav[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
  });

  it('quando listPublicCategories falha (erro de rede/HTTP): Header renderiza normalmente, sem <nav> e sem propagar o erro', async () => {
    const html = await renderHeaderWith(() => Promise.reject(new Error('falha de rede')));

    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
    expect(html).not.toMatch(/<nav[\s>]/);
  });

  it('com Categorias: renderiza <nav> com um link por Categoria, na ordem recebida da API', async () => {
    const html = await renderHeaderWith([
      { name: 'Comparativos', slug: 'comparativos' },
      { name: 'Cafeteiras', slug: 'cafeteiras' },
    ]);

    expect(html).toMatch(/<nav[\s>]/);
    const comparativosIndex = html.indexOf('Comparativos');
    const cafeteirasIndex = html.indexOf('Cafeteiras');
    expect(comparativosIndex).toBeGreaterThan(-1);
    expect(cafeteirasIndex).toBeGreaterThan(-1);
    expect(comparativosIndex).toBeLessThan(cafeteirasIndex);
    expect(html).toMatch(/<a[^>]*href="\/comparativos"[^>]*>Comparativos<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/cafeteiras"[^>]*>Cafeteiras<\/a>/);
  });
});

describe('RootLayout — composição do header', () => {
  afterEach(() => {
    jest.resetModules();
  });

  /**
   * Este `describe` prova só a ORDEM de composição real em `layout.tsx`
   * (`<SiteHeader />` antes de `{children}`) — não o conteúdo/comportamento
   * de `SiteHeader` em si (isso é o `describe` acima + `category-nav.spec.tsx`).
   * Por isso `./site-header` é mocado por um stub síncrono mínimo: evita
   * acoplar este teste de ordem à busca de Categorias (agora assíncrona) e
   * evita a limitação de `react-dom/server` com componentes assíncronos
   * compostos como JSX (ver doc comment do describe acima) — `layout.tsx`
   * em si continua síncrono, só compõe o que importa.
   */
  it('compõe <SiteHeader /> antes do conteúdo da página em <body>', async () => {
    jest.doMock('./site-header', () => ({
      SiteHeader: () => <header data-testid="mock-header" />,
    }));

    const { default: RootLayout } = await import('./layout');
    const html = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="page-content">conteúdo da página</div>
      </RootLayout>,
    );

    const headerIndex = html.indexOf('data-testid="mock-header"');
    const contentIndex = html.indexOf('data-testid="page-content"');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeLessThan(contentIndex);
  });
});
