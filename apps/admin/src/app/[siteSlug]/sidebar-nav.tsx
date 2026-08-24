'use client';

import { usePathname } from 'next/navigation';
import { GuardedLink } from './guarded-link';

interface SidebarNavProps {
  siteSlug: string;
}

/**
 * UXA-006 — Sidebar de navegação primária.
 *
 * Arquitetura de informação definitiva (Etapa A / UX-Implementation-Backlog.md):
 * Dashboard→Artigos→Produtos→Categorias→Autores. Nesta etapa só os 4 itens
 * com rota já existente são renderizados, na mesma ordem relativa. O item
 * Dashboard nasce em UXA-017, quando `apps/admin/src/app/[siteSlug]/page.tsx`
 * existir — até lá, um item apontando para essa rota seria um link morto
 * (404), por isso deliberadamente ausente daqui (achado da investigação
 * desta tarefa, refletido na atualização normativa de UXA-006/UXA-017).
 *
 * Sem prop de Role. As quatro seções são leitura disponível a
 * VIEWER/EDITOR/OWNER igualmente — `Architecture.md` §32 lista "VIEWER+
 * leitura" para as quatro, e nenhuma das quatro páginas de lista
 * (`categories/page.tsx`, `products/page.tsx`, `authors/page.tsx`,
 * `articles/page.tsx`) nega renderização por Role hoje. Restrições de Role
 * continuam ocorrendo dentro de cada tela (ex.: `category-list.tsx` esconde
 * "Criar" para quem não é `EDITOR+`, via `roleMeetsMinimum` de
 * `role-hierarchy.ts`) — nunca na sidebar. Por isso `SidebarNav` recebe só
 * `siteSlug`: criar uma prop `role` e um mecanismo de filtro agora seria
 * abstração sem necessidade real (mesmo princípio já aplicado em
 * UXA-001/002/003/004/005A — infraestrutura nasce de necessidade
 * comprovada, não de antecipação). `SiteRoleProvider` permanece com seu
 * alcance atual (só `children`/`<main>`), sem ampliação.
 *
 * `usePathname()` próprio — componente autocontido, mesmo padrão de
 * `GuardedLink` (que também resolve seu próprio `useRouter()`). Isso torna
 * `usePathname()` desnecessário em `authenticated-shell.tsx`, que deixa de
 * importá-lo.
 *
 * Item ativo por igualdade OU prefixo de seção
 * (`pathname === href || pathname.startsWith(`${href}/`)`), regra já
 * comprovada no shell atual — garante que `/categories/new` e
 * `/categories/:id` também marquem "Categorias" como seção atual, não só a
 * listagem exata, sem marcar falsamente uma rota-irmã com prefixo textual
 * parecido (ex.: um hipotético `/categories-archive` nunca bate, porque o
 * `startsWith` exige a barra depois do segmento).
 *
 * `GuardedLink` em todos os itens — nenhum item pula o dirty-state guard
 * (UXA-003); a Promise de `confirmLeave()` é a mesma instância consumida
 * por troca de Site/Logout em `authenticated-shell.tsx`, via
 * `UnsavedChangesProvider` (`layout.tsx`).
 */
const NAV_ITEMS = [
  { label: 'Artigos', segment: 'articles' },
  { label: 'Produtos', segment: 'products' },
  { label: 'Categorias', segment: 'categories' },
  { label: 'Autores', segment: 'authors' },
] as const;

export function SidebarNav({ siteSlug }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação do Site">
      <ul className="m-0 flex list-none gap-4 p-0">
        {NAV_ITEMS.map((item) => {
          const href = `/${encodeURIComponent(siteSlug)}/${item.segment}`;
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={item.segment}>
              <GuardedLink
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-control font-ui font-action text-body text-fg no-underline focus-visible:outline-none focus-visible:ring-2 ring-focus ${
                  isActive ? 'underline' : ''
                }`}
              >
                {item.label}
              </GuardedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
