import { describe, expect, it } from '@jest/globals';
import { NAV_DESTINATIONS, navDestinationHref } from './nav-destinations';

describe('nav-destinations', () => {
  it('lista exatamente os 4 destinos com rota real hoje, na ordem da arquitetura de informação', () => {
    expect(NAV_DESTINATIONS).toEqual([
      { label: 'Artigos', segment: 'articles' },
      { label: 'Produtos', segment: 'products' },
      { label: 'Categorias', segment: 'categories' },
      { label: 'Autores', segment: 'authors' },
    ]);
  });

  it('não inclui Dashboard (nasce em UXA-017)', () => {
    expect(NAV_DESTINATIONS.some((item) => item.label === 'Dashboard')).toBe(false);
  });

  it('navDestinationHref monta a rota com o siteSlug codificado', () => {
    expect(navDestinationHref('fastcompre', 'categories')).toBe('/fastcompre/categories');
  });

  it('navDestinationHref codifica caracteres especiais do siteSlug', () => {
    expect(navDestinationHref('site com espaço', 'products')).toBe('/site%20com%20espa%C3%A7o/products');
  });
});
