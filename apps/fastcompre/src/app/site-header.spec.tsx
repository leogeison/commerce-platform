import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout from './layout';
import { SiteHeader } from './site-header';

/**
 * apps/fastcompre/src/app/site-header.spec.tsx
 *
 * UXW-001 — cobre a estrutura estática do `<SiteHeader />` (Server
 * Component puro, sem interatividade) via `renderToStaticMarkup`, mesmo
 * padrão já usado em `page.spec.tsx`/`[categorySlug]/page.spec.tsx`. Não
 * introduz Testing Library/jest-axe: nenhuma parte deste componente é
 * interativa, e o precedente real do projeto (`product-block.spec.tsx`, o
 * único spec do FastCompre com `jest-axe`) reserva essas ferramentas para
 * componentes client-side — não uma convenção a aplicar por padrão em todo
 * spec novo.
 *
 * O segundo `describe` prova a integração real ao root layout: um spec
 * isolado do `<SiteHeader />` mostra que o componente em si está correto,
 * mas não prova que `layout.tsx` o compõe antes de `{children}` — por
 * isso `RootLayout` é importado e renderizado aqui diretamente (dentro do
 * trio de arquivos já previsto, sem criar um `layout.spec.tsx` à parte),
 * confirmando a ordem real da árvore renderizada. `next/font/google` é
 * mockado automaticamente pelo `next/jest` (mesma integração já usada por
 * `jest.config.ts`), então importar `layout.tsx` aqui não exige nenhum
 * mock manual.
 */
describe('SiteHeader', () => {
  it('renderiza um landmark <header> com o wordmark "FastCompre" como link para "/"', () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>FastCompre<\/a>/);
  });

  it('não renderiza nenhum <h1> dentro do header', () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).not.toMatch(/<h1[\s>]/);
  });

  it('não renderiza nenhum <nav>', () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).not.toMatch(/<nav[\s>]/);
  });
});

describe('RootLayout — composição do header', () => {
  it('compõe <SiteHeader /> antes do conteúdo da página em <body>', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="page-content">conteúdo da página</div>
      </RootLayout>,
    );

    const headerIndex = html.indexOf('<header');
    const contentIndex = html.indexOf('data-testid="page-content"');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeLessThan(contentIndex);
  });
});
