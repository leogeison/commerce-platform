import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicCategory } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/site-footer.spec.tsx
 *
 * UXW-002 — cobre a estrutura estática do `SiteFooter`.
 *
 * Refinamento visual (rodada isolada, pós-correção final de composição) —
 * `SiteFooter` passou a ser `async` (busca Categorias via
 * `listPublicCategories`, mesmo padrão de `SiteHeader`/UXW-003) — este spec
 * adota exatamente a mesma disciplina já usada em `site-header.spec.tsx`:
 * `jest.doMock('../lib/public-api/client', ...)` + `import()` dinâmico
 * (nunca `jest.mock()` hoistado — não funciona sob o transform SWC do
 * `next/jest` neste projeto) + `renderToStaticMarkup(await SiteFooter())`
 * (chamar a função diretamente, não `<SiteFooter />` como JSX — um
 * componente assíncrono passado como filho de outro elemento não é
 * suportado pelos renderers síncronos de `react-dom/server`, só pela
 * própria árvore RSC do Next.js em runtime real).
 *
 * O segundo `describe` prova a integração real ao root layout — que
 * `layout.tsx` compõe `<SiteFooter />` depois de `{children}`. Consequência
 * direta de `SiteFooter` ter passado a ser `async` (mesmo raciocínio já
 * documentado para `SiteHeader` em UXW-003): `renderToStaticMarkup` não
 * suporta um componente de servidor assíncrono composto como JSX filho, e
 * `layout.tsx` compõe TANTO `<SiteHeader />` quanto `<SiteFooter />` dessa
 * forma — agora os dois precisam ser mocados por stubs síncronos mínimos
 * antes de importar `layout.tsx` (antes desta rodada, só `./site-header`
 * precisava do stub; `./site-footer` era síncrono e não precisava). Isso
 * não testa `SiteFooter` em si (isso é o `describe` acima); só isola a
 * ordem de composição do próprio `layout.tsx`, que continua síncrono.
 */
describe('SiteFooter', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderFooterWith(
    categories: PublicCategory[] | (() => Promise<PublicCategory[]>),
  ): Promise<string> {
    const listPublicCategories =
      typeof categories === 'function' ? categories : () => Promise.resolve(categories);

    jest.doMock('../lib/public-api/client', () => ({ listPublicCategories }));

    // Mesmo motivo documentado em `site-header.spec.tsx`: `react-dom/server`
    // importado dinamicamente aqui, não no topo do arquivo, para vir da
    // MESMA cópia de `react`/`react-dom` que `SiteFooter`/`next/link` usam
    // depois de `jest.resetModules()`.
    const [{ renderToStaticMarkup: renderToStaticMarkupFresh }, { SiteFooter }] =
      await Promise.all([import('react-dom/server'), import('./site-footer')]);
    return renderToStaticMarkupFresh(await SiteFooter());
  }

  it('renderiza um landmark <footer> com o wordmark "FastCompre" como link para "/" e a frase de apoio', async () => {
    const html = await renderFooterWith([]);

    expect(html).toMatch(/<footer[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
    expect(html).toContain('Comparativos e reviews de produtos para o público brasileiro.');
  });

  it('renderiza o texto de divulgação de afiliação aprovado e a linha de copyright', async () => {
    const html = await renderFooterWith([]);

    expect(html).toContain(
      'Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.',
    );
    expect(html).toContain(`© ${new Date().getFullYear()} FastCompre. Todos os direitos reservados.`);
  });

  it('sem Categorias (lista vazia): não renderiza a coluna "Categorias" — degradação graciosa', async () => {
    const html = await renderFooterWith([]);

    expect(html).not.toMatch(/<nav[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
  });

  it('quando listPublicCategories falha (erro de rede/HTTP): Footer renderiza normalmente, sem a coluna "Categorias" e sem propagar o erro', async () => {
    const html = await renderFooterWith(() => Promise.reject(new Error('falha de rede')));

    expect(html).toMatch(/<footer[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
    expect(html).not.toMatch(/<nav[\s>]/);
  });

  it('com Categorias: renderiza a coluna "Categorias" com um link por Categoria, na ordem recebida da API, num <nav> com nome acessível distinto do Header', async () => {
    const html = await renderFooterWith([
      { name: 'Comparativos', slug: 'comparativos' },
      { name: 'Cafeteiras', slug: 'cafeteiras' },
    ]);

    expect(html).toMatch(/<nav[^>]*aria-label="Categorias no rodapé"[^>]*>/);
    const comparativosIndex = html.indexOf('Comparativos');
    const cafeteirasIndex = html.indexOf('Cafeteiras');
    expect(comparativosIndex).toBeGreaterThan(-1);
    expect(cafeteirasIndex).toBeGreaterThan(-1);
    expect(comparativosIndex).toBeLessThan(cafeteirasIndex);
    expect(html).toMatch(/<a[^>]*href="\/comparativos"[^>]*>Comparativos<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/cafeteiras"[^>]*>Cafeteiras<\/a>/);
  });
});

describe('RootLayout — composição do footer', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('compõe <SiteFooter /> depois do conteúdo da página em <body>', async () => {
    jest.doMock('./site-header', () => ({
      SiteHeader: () => <header data-testid="mock-header" />,
    }));
    jest.doMock('./site-footer', () => ({
      SiteFooter: () => <footer data-testid="mock-footer" />,
    }));

    const { default: RootLayout } = await import('./layout');
    const html = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="page-content">conteúdo da página</div>
      </RootLayout>,
    );

    const contentIndex = html.indexOf('data-testid="page-content"');
    const footerIndex = html.indexOf('data-testid="mock-footer"');

    expect(contentIndex).toBeGreaterThan(-1);
    expect(footerIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeLessThan(footerIndex);
  });
});
