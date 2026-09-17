import type { ContextType } from 'react';
import { describe, expect, it } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { PublicCategory } from '@commerce-platform/contracts';
import { CategoryNav } from './category-nav';

/**
 * apps/fastcompre/src/app/category-nav.spec.tsx
 *
 * UXW-003 — `CategoryNav` é o único Client Component desta tarefa
 * (`usePathname()`).
 *
 * Estrutura/conteúdo/`aria-current` (por pathname): `renderToStaticMarkup`
 * dentro de `<PathnameContext.Provider>` — ler contexto durante o render é
 * síncrono e funciona sob renderização estática (diferente de um efeito),
 * então não precisa montar de verdade; mesmo estilo de asserção por regex
 * já usado em todo o resto do FastCompre (`page.spec.tsx`,
 * `site-header.spec.tsx`). `apps/fastcompre` não depende de
 * `@testing-library/jest-dom` (só `apps/admin` depende) — por isso nenhum
 * matcher `toHaveAttribute`/`toHaveAccessibleName` é usado aqui; introduzir
 * essa dependência só para este spec seria infraestrutura de teste nova
 * não autorizada.
 *
 * Acessibilidade: `render()` (Testing Library) + `axe()` — único uso de
 * Testing Library neste spec, mesmo precedente real do projeto
 * (`product-block.spec.tsx`, que também só usa `render`+`axe`, nunca
 * `screen.getByRole`/matchers de conteúdo). `RouterContext` (legado, lido
 * por `next/link`) + `AppRouterContext` (`useRouter()`) + `PathnameContext`
 * (`usePathname()`) — mesmo harness comprovado em
 * `apps/admin/src/app/[siteSlug]/sidebar-nav.spec.tsx` para montar
 * `next/link` via Testing Library sem invariant de router ausente.
 */
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

const mockLegacyRouter = {
  pathname: '/',
  asPath: '/',
  push: () => {},
  replace: () => {},
  prefetch: () => Promise.resolve(),
};

const CATEGORIES: PublicCategory[] = [
  { name: 'Comparativos', slug: 'comparativos' },
  { name: 'Cafeteiras', slug: 'cafeteiras' },
];

function staticMarkupAt(pathname: string): string {
  return renderToStaticMarkup(
    <PathnameContext.Provider value={pathname}>
      <CategoryNav categories={CATEGORIES} />
    </PathnameContext.Provider>,
  );
}

/**
 * Extrai o conteúdo de atributos de `<a ...>Nome</a>` para um texto de
 * link exato, sem assumir ordem de atributos: `next/link` reordena o que
 * é passado via JSX (`href` sai por último no HTML, independente da
 * ordem em que foi escrito no componente) — comprovado empiricamente
 * neste projeto, então a asserção não pode depender de `href` vir antes
 * ou depois de `aria-current`/`class`.
 */
function linkAttrs(html: string, linkText: string): string {
  const match = html.match(new RegExp(`<a([^>]*)>${linkText}</a>`));
  if (!match) {
    throw new Error(`Link "${linkText}" não encontrado no HTML: ${html}`);
  }
  return match[1];
}

function mountAt(pathname: string) {
  return render(
    <RouterContext.Provider value={mockLegacyRouter as never}>
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>
          <CategoryNav categories={CATEGORIES} />
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>,
  );
}

describe('CategoryNav', () => {
  it('renderiza um landmark <nav aria-label="Categorias"> com um link por Categoria, na ordem recebida', () => {
    const html = staticMarkupAt('/');

    expect(html).toMatch(/<nav[^>]*aria-label="Categorias"[^>]*>/);
    const comparativosIndex = html.indexOf('Comparativos');
    const cafeteirasIndex = html.indexOf('Cafeteiras');
    expect(comparativosIndex).toBeGreaterThan(-1);
    expect(cafeteirasIndex).toBeGreaterThan(-1);
    expect(comparativosIndex).toBeLessThan(cafeteirasIndex);
    expect(html).toMatch(/<a[^>]*href="\/comparativos"[^>]*>Comparativos<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/cafeteiras"[^>]*>Cafeteiras<\/a>/);
  });

  it('em "/" (Home), nenhum item recebe aria-current', () => {
    const html = staticMarkupAt('/');

    expect(html).not.toMatch(/aria-current/);
  });

  it('na rota exata de uma Categoria, só ela recebe aria-current="page"', () => {
    const html = staticMarkupAt('/comparativos');

    const activeAttrs = linkAttrs(html, 'Comparativos');
    expect(activeAttrs).toContain('href="/comparativos"');
    expect(activeAttrs).toContain('aria-current="page"');

    const inactiveAttrs = linkAttrs(html, 'Cafeteiras');
    expect(inactiveAttrs).toContain('href="/cafeteiras"');
    expect(inactiveAttrs).not.toContain('aria-current');
  });

  it('num Artigo sob a Categoria, só ela recebe aria-current="location" (nunca "page")', () => {
    const html = staticMarkupAt('/comparativos/melhor-fone-bluetooth');

    const activeAttrs = linkAttrs(html, 'Comparativos');
    expect(activeAttrs).toContain('href="/comparativos"');
    expect(activeAttrs).toContain('aria-current="location"');
    expect(activeAttrs).not.toContain('aria-current="page"');

    const inactiveAttrs = linkAttrs(html, 'Cafeteiras');
    expect(inactiveAttrs).toContain('href="/cafeteiras"');
    expect(inactiveAttrs).not.toContain('aria-current');
  });

  it('em pathname sem Categoria correspondente, nenhum item fica ativo', () => {
    const html = staticMarkupAt('/rota-sem-categoria');

    expect(html).not.toMatch(/aria-current/);
  });

  it('todo link é um <a href> real, sem tabindex negativo — alcançável nativamente por teclado', () => {
    mountAt('/');

    for (const link of screen.getAllByRole('link')) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).not.toBeNull();
      expect(link.getAttribute('tabindex')).not.toBe('-1');
    }

    const nav = screen.getByRole('navigation', { name: 'Categorias' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
  });

  it.each([
    ['Home, nenhum item ativo', '/'],
    ['rota exata de Categoria (aria-current="page")', '/comparativos'],
    ['Artigo sob Categoria (aria-current="location")', '/comparativos/melhor-fone-bluetooth'],
  ])('não tem violação de acessibilidade (jest-axe) — %s', async (_label, pathname) => {
    const { container } = mountAt(pathname);

    expect(await axe(container)).toHaveNoViolations();
  });
});
