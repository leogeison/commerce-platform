import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteFooter } from './site-footer';

/**
 * apps/fastcompre/src/app/site-footer.spec.tsx
 *
 * UXW-002 — cobre a estrutura estática do `<SiteFooter />` (Server
 * Component puro, sem interatividade) via `renderToStaticMarkup`, mesmo
 * padrão já usado em `site-header.spec.tsx`. Não introduz Testing
 * Library/jest-axe pelo mesmo motivo já documentado lá: nenhuma parte deste
 * componente é interativa.
 *
 * O segundo `describe` prova a integração real ao root layout — que
 * `layout.tsx` compõe `<SiteFooter />` depois de `{children}` — mesmo
 * padrão do teste de integração já existente para `<SiteHeader />`. Não
 * duplica um teste por rota: a herança pelo root layout já comprova a
 * presença do footer nas 3 rotas públicas.
 *
 * UXW-003 (ajuste mínimo, consequência direta e necessária de
 * `SiteHeader` ter passado a ser `async`): `layout.tsx` continua
 * compondo `<SiteHeader />` antes de `<SiteFooter />`/`{children}` — um
 * componente de servidor assíncrono passado como filho de outro elemento
 * não é suportado por `renderToStaticMarkup` (só pela árvore RSC real do
 * Next.js em runtime), então este `describe` mocka `./site-header` por um
 * stub síncrono mínimo antes de importar `layout.tsx` dinamicamente —
 * mesmo tratamento já aplicado ao teste equivalente em
 * `site-header.spec.tsx`. Isso não testa `SiteHeader` (isso é
 * `site-header.spec.tsx` + `category-nav.spec.tsx`); só isola a ordem de
 * composição do próprio `layout.tsx`, que continua síncrono.
 */
describe('SiteFooter', () => {
  it('renderiza um landmark <footer> com o texto de divulgação de afiliação aprovado', () => {
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(html).toMatch(/<footer[\s>]/);
    expect(html).toContain(
      'Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.',
    );
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

    const { default: RootLayout } = await import('./layout');
    const html = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="page-content">conteúdo da página</div>
      </RootLayout>,
    );

    const contentIndex = html.indexOf('data-testid="page-content"');
    const footerIndex = html.indexOf('<footer');

    expect(contentIndex).toBeGreaterThan(-1);
    expect(footerIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeLessThan(footerIndex);
  });
});
