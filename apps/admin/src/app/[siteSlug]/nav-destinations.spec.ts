import { describe, expect, it } from '@jest/globals';
import { NAV_DESTINATIONS, isNavDestinationActive, navDestinationHref } from './nav-destinations';

describe('nav-destinations', () => {
  it('lista os 5 destinos na ordem definitiva da arquitetura de informação, com Dashboard primeiro e marcado como rota raiz', () => {
    expect(NAV_DESTINATIONS).toEqual([
      { label: 'Dashboard', segment: '', isRootRoute: true },
      { label: 'Artigos', segment: 'articles' },
      { label: 'Produtos', segment: 'products' },
      { label: 'Categorias', segment: 'categories' },
      { label: 'Autores', segment: 'authors' },
    ]);
  });

  it('navDestinationHref monta a rota com o siteSlug codificado', () => {
    expect(navDestinationHref('fastcompre', 'categories')).toBe('/fastcompre/categories');
  });

  it('navDestinationHref codifica caracteres especiais do siteSlug', () => {
    expect(navDestinationHref('site com espaço', 'products')).toBe('/site%20com%20espa%C3%A7o/products');
  });

  it('navDestinationHref com segment vazio (Dashboard) monta só /:siteSlug, sem barra extra', () => {
    expect(navDestinationHref('fastcompre', '')).toBe('/fastcompre');
  });

  describe('isNavDestinationActive', () => {
    const dashboard = NAV_DESTINATIONS[0]!;
    const articles = NAV_DESTINATIONS[1]!;

    it('Dashboard: ativo somente na raiz exata', () => {
      expect(isNavDestinationActive('/fastcompre', '/fastcompre', dashboard)).toBe(true);
    });

    it('Dashboard: NÃO ativo em nenhuma subrota do Site, mesmo sendo prefixo textual de todas', () => {
      expect(isNavDestinationActive('/fastcompre/articles', '/fastcompre', dashboard)).toBe(false);
      expect(isNavDestinationActive('/fastcompre/products', '/fastcompre', dashboard)).toBe(false);
      expect(isNavDestinationActive('/fastcompre/categories/new', '/fastcompre', dashboard)).toBe(false);
    });

    it('destino comum (não isRootRoute): ativo por igualdade exata', () => {
      expect(isNavDestinationActive('/fastcompre/articles', '/fastcompre/articles', articles)).toBe(true);
    });

    it('destino comum (não isRootRoute): ativo também em subrota (ex.: /articles/:id)', () => {
      expect(
        isNavDestinationActive(
          '/fastcompre/articles/11111111-1111-4111-8111-111111111111',
          '/fastcompre/articles',
          articles,
        ),
      ).toBe(true);
    });

    it('destino comum (não isRootRoute): não ativo numa rota-irmã com prefixo textual parecido', () => {
      expect(isNavDestinationActive('/fastcompre/articles-archive', '/fastcompre/articles', articles)).toBe(false);
    });

    it('destino comum (não isRootRoute): não ativo na raiz do Site', () => {
      expect(isNavDestinationActive('/fastcompre', '/fastcompre/articles', articles)).toBe(false);
    });
  });
});
