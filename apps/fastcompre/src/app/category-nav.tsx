'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PublicCategory } from '@commerce-platform/contracts';

interface CategoryNavProps {
  categories: PublicCategory[];
}

/**
 * apps/fastcompre/src/app/category-nav.tsx
 *
 * UXW-003 — Menu global de Categorias do FastCompre. Client Component
 * mínimo: a única razão de existir `"use client"` aqui é `usePathname()`,
 * usado exclusivamente para indicar o item ativo — nenhum fetch, nenhum
 * estado de menu (abrir/fechar), nenhuma outra interação. `categories` é
 * sempre recebido pronto, já buscado/paginado por `SiteHeader`
 * (Server Component) via `listPublicCategories()` — este componente nunca
 * chama a API pública.
 *
 * Links diretos — nenhum dropdown (decisão fechada da UXW-003, revisitando
 * o ponto deixado em aberto por
 * `docs/UXW-visual-direction-decision.md`, Seção 3).
 *
 * Determinação de item ativo, sem heurística: a estrutura real de rotas do
 * FastCompre é só `/`, `/:categorySlug` e `/:categorySlug/:articleSlug`
 * (nenhuma outra rota pública existe) — o primeiro segmento do `pathname`
 * é sempre a Categoria real do conteúdo em tela, nunca um valor obsoleto,
 * porque `ArticlePage` (`[categorySlug]/[articleSlug]/page.tsx`) já
 * redireciona (`permanentRedirect`, 308) sempre que a Categoria da URL
 * diverge da Categoria real do Artigo, antes de qualquer render.
 * - `/` (zero segmentos) → nenhuma Categoria ativa;
 * - um segmento igual ao `slug` de alguma Categoria da lista →
 *   `aria-current="page"` (é a própria página da Categoria);
 * - dois segmentos, o primeiro igual ao `slug` de alguma Categoria →
 *   `aria-current="location"` (é um Artigo daquela Categoria);
 * - primeiro segmento sem correspondência em nenhuma Categoria da lista
 *   (inclusive uma Categoria arquivada, que não está em `categories`, ou
 *   uma rota totalmente alheia) → nenhum item ativo.
 *
 * Estado ativo visualmente distinguível sem depender só de cor (WCAG
 * 1.4.1): mesmo tratamento já aprovado e em produção em
 * `apps/admin/src/app/[siteSlug]/sidebar-nav.tsx` (UXA-019C) — forma
 * (`rounded-pill` só no item ativo, `rounded-control` nos demais) somada a
 * `bg-accent-subtle`/`text-accent-subtle-fg`, tokens já existentes em
 * `packages/ui/tokens/tailwind-theme.css`/`semantic-colors.css` — nenhum
 * token novo. `aria-current` é o sinal programático, o par forma+cor é o
 * sinal visual.
 *
 * Responsividade desta tarefa: só reflow natural (`flex-wrap`) — sem
 * drawer, toggle, `<dialog>` ou breakpoint algum, que pertencem à UXW-004
 * (não antecipada aqui).
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const pathname = usePathname();
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  const currentSlug = segments[0];
  const isArticleRoute = segments.length >= 2;

  return (
    <nav aria-label="Categorias">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {categories.map((category) => {
          const isActive = category.slug === currentSlug;
          const ariaCurrent = isActive ? (isArticleRoute ? 'location' : 'page') : undefined;

          return (
            <li key={category.slug}>
              <Link
                href={`/${category.slug}`}
                aria-current={ariaCurrent}
                className={`px-control-x py-control-y font-ui text-body text-fg no-underline hover:text-accent focus-visible:outline-none focus-visible:ring-2 ring-focus ${
                  isActive
                    ? 'rounded-pill bg-accent-subtle text-accent-subtle-fg'
                    : 'rounded-control'
                }`}
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
