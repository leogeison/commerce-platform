import type { Role } from '@commerce-platform/contracts';

/**
 * UXA-010 — fonte local dos atalhos de criação da Command Palette.
 *
 * Deliberadamente irmão de `nav-destinations.ts`, nunca uma extensão dele:
 * `nav-destinations.ts` é a fonte compartilhada com `SidebarNav`, que nunca
 * exibe ações de criação — misturar os dois conceitos ali romperia a
 * responsabilidade única documentada naquele módulo. `CommandPalette` é o
 * único consumidor deste arquivo.
 *
 * `minRole` é sempre `'EDITOR'` hoje nas 4 entidades — confirmado a partir
 * do código real (`roleMeetsMinimum(role, 'EDITOR')` em
 * `category-list.tsx`/`product-list.tsx`/`author-list.tsx`/`article-list.tsx`,
 * e `Architecture.md` §32/§16: rotas `/new` exigem `EDITOR`), não um valor
 * inventado. Ainda assim é modelado por item, não hardcoded 4× no
 * componente, para que a regra fique legível e localizada aqui caso um
 * dia deixe de ser uniforme entre as 4 entidades.
 *
 * Labels reaproveitam exatamente a copy já usada nas 4 listagens ("Novo
 * Artigo"/"Novo Produto"/"Nova Categoria"/"Novo Autor") — consistência com
 * o resto do Admin, não uma escolha nova.
 */
export interface CreateAction {
  readonly label: string;
  readonly segment: string;
  readonly minRole: Role;
}

export const CREATE_ACTIONS: readonly CreateAction[] = [
  { label: 'Novo Artigo', segment: 'articles', minRole: 'EDITOR' },
  { label: 'Novo Produto', segment: 'products', minRole: 'EDITOR' },
  { label: 'Nova Categoria', segment: 'categories', minRole: 'EDITOR' },
  { label: 'Novo Autor', segment: 'authors', minRole: 'EDITOR' },
] as const;

export function createActionHref(siteSlug: string, segment: string): string {
  return `/${encodeURIComponent(siteSlug)}/${segment}/new`;
}
