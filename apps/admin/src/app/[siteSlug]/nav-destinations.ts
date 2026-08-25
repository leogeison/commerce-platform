/**
 * UXA-009 — fonte única dos destinos de navegação primária do Admin,
 * compartilhada entre `SidebarNav` (UXA-006) e `CommandPalette` (UXA-009).
 *
 * Extraído do `NAV_ITEMS` que antes vivia só em `sidebar-nav.tsx`: com a
 * Command Palette se tornando um segundo consumidor real da mesma lista,
 * duplicá-la ali e aqui criaria duas fontes divergentes do mesmo dado —
 * exatamente o que a doc do componente original já evitava ao reaproveitar
 * `renderNavList()` para as duas apresentações (persistente/drawer) dentro
 * do próprio `SidebarNav`. Este módulo estende esse mesmo princípio para
 * fora do componente.
 *
 * Somente os 4 destinos com rota real hoje (Artigos, Produtos, Categorias,
 * Autores) — Dashboard nasce em UXA-017, mesma decisão já tomada em
 * UXA-006 para o mesmo caso (evitar link morto/404 para uma rota que ainda
 * não existe). UXA-017 adiciona o destino Dashboard aqui, refletindo
 * automaticamente nos dois consumidores sem alteração estrutural em
 * nenhum dos dois.
 */
export interface NavDestination {
  readonly label: string;
  readonly segment: string;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { label: 'Artigos', segment: 'articles' },
  { label: 'Produtos', segment: 'products' },
  { label: 'Categorias', segment: 'categories' },
  { label: 'Autores', segment: 'authors' },
] as const;

export function navDestinationHref(siteSlug: string, segment: string): string {
  return `/${encodeURIComponent(siteSlug)}/${segment}`;
}
