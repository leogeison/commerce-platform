import { buildPageWindow, hrefForPage } from './pagination-window';

/**
 * apps/fastcompre/src/app/pagination.tsx
 *
 * UXW-012 — Paginação consistente (Home + Categoria). Componente
 * compartilhado só dentro de `apps/fastcompre` (decisão fechada do desenho
 * técnico aprovado): mesmo shape/comportamento/padrão de URL nas duas
 * únicas rotas que o consomem hoje. Não sobe para `packages/ui` — a
 * paginação já existente no Admin (`product-list.tsx` e afins) é outro
 * desenho de interação (botões `onClick`, sem `href`, sem números de
 * página, sem `aria-current`), não o mesmo componente; promover agora
 * seria abstração especulativa (Architecture.md §7). Este componente não
 * conhece `Article`/`Category` — só números de página e uma `basePath` já
 * pronta.
 *
 * Lógica pura (validação de `page`, `href`, janela truncada) vive em
 * `./pagination-window.ts`, não aqui — mesma convenção já usada no
 * repositório para separar lógica de componente (`product-block-
 * resolver.ts`/`product-block.tsx`, `affiliate-redirect-href.ts`); também
 * evita o aviso `react-refresh/only-export-components` do ESLint (este
 * arquivo passa a exportar só o componente `Pagination`).
 *
 * Server Component puro (nenhum hook, nenhum estado, nenhuma diretiva
 * `"use client"`) — cada página numerada/anterior/próxima é um `<a href>`
 * real, funcional sem JavaScript. `<a>` nativo, não o `Link` de
 * `next/link`: mesmo critério já usado pelos cards de Artigo em
 * `(home)/page.tsx`/`[categorySlug]/page.tsx` (ambos usam `<a href>`
 * puro para os links de artigo, não `Link`) — `category-nav.tsx` usa
 * `Link` porque é um Client Component que também precisa de
 * `usePathname()` (estado ativo); este componente não tem nenhuma
 * necessidade client-side (`aria-current` é calculado só a partir de
 * props já conhecidas no servidor), então `<a>` nativo é a opção mais
 * simples e coerente com um Server Component puro — e evita depender do
 * runtime de Client Component (`next/link` prefetching/interceptação de
 * clique) para algo que não precisa dele.
 *
 * Decisões fechadas do desenho aprovado, aplicadas aqui:
 * - página 1 nunca gera `?page=1` — `hrefForPage` (`./pagination-
 *   window.ts`) devolve a própria `basePath` limpa para `page <= 1`;
 * - `pageSize` nunca aparece na URL (não é parâmetro deste componente);
 * - `totalPages <= 1` não renderiza nenhum controle (nenhuma UI de
 *   paginação para conteúdo de página única ou vazio);
 * - janela truncada: sempre primeira e última página, página atual ±1,
 *   reticências não focáveis (`aria-hidden`, sem link) preenchendo
 *   qualquer lacuna — nunca números duplicados nas bordas (deduplicados
 *   via `Set` em `buildPageWindow`, não por checagem manual de índice);
 *   página atual nunca é um link para si mesma (`<span
 *   aria-current="page">`, não `<a>`).
 *
 * Hit target (ponto 9 do desenho aprovado — confirmado por cálculo a
 * partir dos valores reais dos tokens, não presumido pelo nome):
 * `apps/fastcompre` nunca aplica `[data-density='compact']`
 * (`packages/ui/tokens/spacing.css` documenta esse override como
 * disponível, não aplicado em nenhum app) — logo `--space-control-y`
 * resolve sempre para `--space-3` (12px) e `--space-control-x` para
 * `--space-4` (16px) nesta rota, em qualquer viewport (não há query nem
 * regra que troque esses tokens por breakpoint). Com `text-body`
 * (`--font-size-base` 16px / `--line-height-base` 24px,
 * `packages/ui/tokens/typography.css`), a caixa de cada link/página numera
 * resolve para 24px (linha) + 12px×2 (padding vertical) = 48px de altura;
 * a largura mínima (um único dígito) é 16px×2 (padding horizontal) + a
 * largura do glifo, sempre acima de 24px. As duas dimensões excedem com
 * folga o mínimo de 24×24px CSS da WCAG 2.2 SC 2.5.8 (AA) — o mesmo
 * cálculo vale em qualquer largura de viewport, já que nenhum destes
 * tokens muda por media query nesta rota. Confirmação por render visual
 * real (Playwright/Chromium) permanece bloqueada pela mesma limitação de
 * infraestrutura/rede já documentada e aceita pelo PO na UXE-022 — este é
 * um cálculo analítico a partir dos tokens reais consumidos pelo
 * componente, não uma medição visual.
 */

const LINK_CLASS_NAME =
  'rounded-control px-control-x py-control-y font-ui text-body text-fg no-underline hover:text-accent focus-visible:outline-none focus-visible:ring-2 ring-focus';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /**
   * URL "limpa" da página 1 desta listagem (sem querystring) — `/` para a
   * Home, `/${categorySlug}` para a Categoria. Nunca deve incluir `?page=`
   * nem `pageSize`.
   */
  basePath: string;
}

export function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const items = buildPageWindow(currentPage, totalPages);

  return (
    <nav aria-label="Paginação" className="mt-12 flex justify-center">
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {currentPage > 1 && (
          <li>
            <a href={hrefForPage(basePath, currentPage - 1)} aria-label="Página anterior" className={LINK_CLASS_NAME}>
              Anterior
            </a>
          </li>
        )}

        {items.map((item) => {
          if (typeof item !== 'number') {
            return (
              <li
                key={item.key}
                aria-hidden="true"
                className="px-control-x py-control-y font-ui text-body text-fg-muted select-none"
              >
                …
              </li>
            );
          }

          if (item === currentPage) {
            return (
              <li key={item}>
                <span
                  aria-current="page"
                  aria-label={`Página ${item} de ${totalPages}`}
                  className="inline-block rounded-pill bg-accent-subtle px-control-x py-control-y font-ui text-body text-accent-subtle-fg"
                >
                  {item}
                </span>
              </li>
            );
          }

          return (
            <li key={item}>
              <a href={hrefForPage(basePath, item)} aria-label={`Ir para a página ${item}`} className={LINK_CLASS_NAME}>
                {item}
              </a>
            </li>
          );
        })}

        {currentPage < totalPages && (
          <li>
            <a href={hrefForPage(basePath, currentPage + 1)} aria-label="Próxima página" className={LINK_CLASS_NAME}>
              Próxima
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
