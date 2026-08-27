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
 * UXA-017 — Dashboard nasce como 5º destino, na primeira posição (arquitetura
 * de informação definitiva: Dashboard→Artigos→Produtos→Categorias→Autores),
 * agora que `apps/admin/src/app/[siteSlug]/page.tsx` existe. Antes desta
 * tarefa, um item apontando para essa rota seria um link morto (404) — por
 * isso ficou deliberadamente ausente em UXA-006/UXA-009 (ver histórico
 * daquelas tarefas). Adicionado só aqui: `SidebarNav` e `CommandPalette`
 * continuam consumindo `NAV_DESTINATIONS` genericamente, sem alteração
 * estrutural em nenhum dos dois — o novo item reflete automaticamente nos
 * dois consumidores.
 */
export interface NavDestination {
  readonly label: string;
  readonly segment: string;
  /**
   * Marca Dashboard como a única rota raiz da árvore de navegação — `''`
   * concatenado ingenuamente por `navDestinationHref`/pela regra de
   * prefixo de `isNavDestinationActive` bateria com QUALQUER rota do Site
   * (toda rota começa com `/:siteSlug`), o que tornaria Dashboard
   * incorretamente "ativo" em `/articles`, `/products` etc. Representação
   * mínima e intencional (não um caso genérico de "rota com prefixo
   * vazio"): só Dashboard tem `segment: ''` hoje, e é o único destino que
   * precisa de um tratamento de igualdade exata — os demais continuam na
   * regra padrão (igualdade OU subrota), sem essa flag.
   */
  readonly isRootRoute?: boolean;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { label: 'Dashboard', segment: '', isRootRoute: true },
  { label: 'Artigos', segment: 'articles' },
  { label: 'Produtos', segment: 'products' },
  { label: 'Categorias', segment: 'categories' },
  { label: 'Autores', segment: 'authors' },
] as const;

/**
 * `segment === ''` (Dashboard) monta `/:siteSlug`, sem barra extra no fim
 * — `/:siteSlug/` seria uma URL tecnicamente diferente (e, mais
 * concretamente, diferente do `pathname` que `usePathname()` realmente
 * devolve para a rota `/:siteSlug/page.tsx` em produção, que nunca traz
 * barra final). Único ponto de montagem de `href` do módulo — nenhum
 * consumidor concatena segmento manualmente.
 */
export function navDestinationHref(siteSlug: string, segment: string): string {
  return segment === '' ? `/${encodeURIComponent(siteSlug)}` : `/${encodeURIComponent(siteSlug)}/${segment}`;
}

/**
 * UXA-017 — cálculo centralizado de item ativo, único ponto de decisão
 * consumido por `SidebarNav` (`aria-current`) hoje; `CommandPalette` não
 * tem noção de item ativo (é busca+navegação, não um menu com estado
 * "onde estou"), então não consome esta função.
 *
 * Dois regimes, nunca um `segment === ''` espalhado pelos consumidores:
 * - `destination.isRootRoute`: só `pathname === href` — nenhuma regra de
 *   subrota. Sem isso, Dashboard (`href` = `/:siteSlug`) bateria com
 *   `pathname?.startsWith('/:siteSlug/')`, que é verdade para TODA outra
 *   rota do Site (`/articles`, `/products` etc.) — o próprio bug que a
 *   investigação desta tarefa encontrou antes da implementação.
 * - demais destinos: regra já existente e comprovada (igualdade OU
 *   prefixo de seção, `pathname === href || pathname.startsWith(href + '/')`),
 *   sem alteração — `/categories/new` e `/categories/:id` continuam
 *   marcando "Categorias" como seção atual, exatamente como antes desta
 *   tarefa.
 */
export function isNavDestinationActive(
  pathname: string | null,
  href: string,
  destination: NavDestination,
): boolean {
  if (destination.isRootRoute) {
    return pathname === href;
  }
  return pathname === href || pathname?.startsWith(`${href}/`) === true;
}
