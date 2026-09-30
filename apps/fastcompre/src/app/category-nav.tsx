'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PublicCategory } from '@commerce-platform/contracts';
import styles from './category-nav.module.css';

interface CategoryNavProps {
  categories: PublicCategory[];
}

/**
 * Ícone hambúrguer do trigger mobile — `<svg>` local, decorativo
 * (`aria-hidden="true"`; o nome acessível do botão vem de `aria-label`, não
 * deste ícone). 3 linhas paralelas, geometria genérica (sem precedente de
 * marca/ilustração de terceiros a reproduzir) — ver doc comment principal
 * abaixo para o racional completo de não introduzir `lucide-react` aqui.
 */
function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-5 w-5"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/**
 * apps/fastcompre/src/app/category-nav.tsx
 *
 * UXW-003 — Menu global de Categorias do FastCompre. Client Component
 * mínimo: a única razão de existir `"use client"` aqui é `usePathname()`,
 * usado exclusivamente para indicar o item ativo — nenhum fetch, nenhum
 * outra interação além do próprio menu. `categories` é sempre recebido
 * pronto, já buscado/paginado por `SiteHeader` (Server Component) via
 * `listPublicCategories()` — este componente nunca chama a API pública.
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
 * UXW-004 — Drawer mobile de Categorias.
 *
 * Breakpoint `640px` (`sm`, token padrão do Tailwind v4, sem token
 * customizado — mesmo critério de reaproveitamento já usado pelo Admin com
 * `lg`): fechado por medição empírica própria deste Header (Playwright/
 * Chromium contra o markup real, tokens reais de espaçamento/tipografia),
 * não herdado do breakpoint `lg` do Admin por analogia. A medição original
 * foi feita com o container do Header limitado a `max-w-3xl` (768px): nessa
 * largura, a navegação persistente nunca chegava a caber numa única linha
 * para uma contagem realista de Categorias (o comprimento útil do
 * container já era insuficiente antes mesmo do viewport crescer além de
 * 768px) — por isso o critério objetivo usado não foi "elimina quebra de
 * linha", e sim "largura a partir da qual o número de linhas do Header
 * para de piorar conforme a tela estreita" (o platô medido, nos cenários de
 * 4/6/8 Categorias testados, foi alcançado o mais tardar em 630px —
 * `640px`/`sm` cobre os três com margem, sem introduzir token novo). Abaixo
 * de `320px` até `630px`, a navegação persistente chegaria a ocupar de 4 a
 * 7 linhas dependendo da contagem de Categorias — é exatamente essa faixa
 * que o drawer substitui por um único trigger.
 *
 * Refinamento visual pós-`testeLayout.png` (correção final de composição)
 * — o Header passou a usar `max-w-6xl` (1152px) em vez de `max-w-3xl`
 * (768px, ver `site-header.tsx`). Isso NÃO invalida a medição acima: abaixo
 * de 768px de viewport o container já era fluido em ambos os casos
 * (`max-w-*` só limita o teto, nunca o comprimento abaixo dele), então o
 * platô medido a 630px continua válido sem nova medição — o container mais
 * largo só passa a fazer diferença ACIMA de 768px, faixa em que a
 * navegação persistente já estava resolvida pela medição original. Alargar
 * o Header só aumenta a margem de segurança acima do platô, nunca a
 * reduz.
 *
 * Mesma fronteira Server/Client de antes: `SiteHeader` continua decidindo
 * só SE este componente é renderizado (Categorias presentes vs. erro/
 * lista vazia) — todo o mecanismo de abrir/fechar do drawer vive aqui
 * dentro, no Client Component já existente, sem introduzir uma segunda
 * fronteira `"use client"` nem mover nada para `SiteHeader`.
 *
 * `renderCategoryLinks()` é a ÚNICA função que produz a lista de Links —
 * usada tanto na navegação persistente (`sm+`) quanto dentro do `<dialog>`
 * (`<sm`). Nenhuma segunda cópia da lógica de item ativo/`aria-current`:
 * ambas as apresentações leem exatamente o mesmo `currentSlug`/
 * `isArticleRoute` computados uma única vez acima.
 *
 * Drawer via `<dialog>` nativo + `showModal()` — mesmo mecanismo já
 * comprovado em produção por `apps/admin/src/app/[siteSlug]/
 * sidebar-nav.tsx` (UXA-008/UXA-019B), não uma reimplementação:
 * - abrir: `<button type="button">` real, `onClick` chama
 *   `dialogRef.current.showModal()`;
 * - fechamento por botão "Fechar": único botão dentro do diálogo, primeiro
 *   elemento focável (`autoFocus`) — chama `dialogRef.current.close()`;
 * - fechamento por `Escape`: comportamento nativo do `<dialog>` modal, sem
 *   handler manual (fora do polyfill de teste, só necessário em jsdom —
 *   ver `jest.setup.ts`);
 * - contenção de foco: nativa (top-layer modal de `showModal()`), sem
 *   focus-trap manual;
 * - foco inicial: nativo, `autoFocus` no botão "Fechar";
 * - retorno de foco ao trigger: nativo, `<dialog>.close()` devolve foco ao
 *   elemento que estava focado antes de `showModal()` (mesmo
 *   comportamento já confirmado empiricamente em Chromium real pelo
 *   Admin);
 * - fechamento por clique no backdrop: **deliberadamente não
 *   implementado** nesta tarefa (decisão fechada no desenho — não é
 *   critério do backlog e não deve ser presumido como comportamento
 *   nativo do `<dialog>`; `<dialog>` sozinho não fecha ao clicar fora sem
 *   um handler explícito, que este componente não adiciona);
 * - fechamento por navegação real: mesmo padrão do Admin — um `useEffect`
 *   observa `pathname`, comparando contra uma ref inicializada com o
 *   próprio `pathname` da montagem (nunca fecha na montagem inicial); só
 *   fecha quando o valor muda de fato;
 * - fechamento ao cruzar para `sm+`: um segundo `useEffect`, local a este
 *   componente, assina `window.matchMedia('(min-width: 640px)')` via
 *   `addEventListener('change', ...)` e fecha o `<dialog>` só se estiver
 *   aberto no momento em que a media query passa a bater — sem isto, um
 *   redimensionamento de estreito para `sm+` com o drawer aberto deixaria
 *   um modal ainda bloqueando a página, agora com o trigger que o abriu
 *   oculto por CSS. `typeof window.matchMedia === 'function'` protege
 *   apenas o ambiente de teste (jsdom não implementa `matchMedia` — a
 *   suíte estuba isso por teste, nunca globalmente); em qualquer navegador
 *   real a checagem é sempre verdadeira.
 * - `aria-label="Categorias"` no `<dialog>` e no trigger (`aria-haspopup=
 *   "dialog"`/`aria-expanded`/`aria-controls`); botão de fechamento com
 *   texto visível "Fechar" — nenhuma mudança nesses dois.
 *
 * Refinamento visual (rodada isolada, pós-correção final de composição) —
 * trigger mobile ganhou ícone hambúrguer, substituindo o texto visível
 * "Categorias": `HamburgerIcon` abaixo é um `<svg>` local, puramente
 * geométrico (3 linhas paralelas, nenhum traço reconhecível de marca/
 * ilustração de terceiros) — `lucide-react` continua deliberadamente NÃO
 * introduzida em `apps/fastcompre` (decisão já fechada, não reaberta aqui;
 * `packages/ui` depende de `lucide-react` só para consumo do Admin). O
 * ícone é `aria-hidden="true"` (puramente decorativo); o nome acessível do
 * botão passa a vir de `aria-label="Categorias"` — mesmo texto que já era
 * usado visualmente antes, então a busca por nome acessível em qualquer
 * teste/leitor de tela não muda. Estado aberto/fechado continua comunicado
 * de forma programática por `aria-expanded` (inalterado) — o ícone em si
 * não alterna forma (hambúrguer → X) nesta rodada: o `<dialog>` modal já
 * assume a interação assim que abre (foco move para "Fechar", texto visível
 * dentro do diálogo), então uma segunda pista visual no próprio trigger não
 * foi considerada necessária (decisão desta rodada; não é o mesmo critério
 * usado pelo Admin, que não tem um trigger equivalente).
 *
 * Refinamento visual (2ª rodada isolada, alinhamento final com
 * `testeLayout.png`) — dois ajustes puramente visuais no trigger, nenhum
 * comportamento novo:
 * - posição: `ml-auto` empurra o trigger para o canto direito do Header —
 *   único filho visível do container flex do Header (`site-header.tsx`)
 *   além do wordmark em telas `<sm:` (a `<nav>` persistente já é `hidden`
 *   nessa faixa, e o `<dialog>` fechado não participa do layout) — por
 *   isso resolvido inteiramente aqui, sem tocar `site-header.tsx`. Como
 *   `ml-auto` não tem prefixo de breakpoint mas o próprio botão continua
 *   `sm:hidden`, ele deixa de existir no layout a partir de `sm:` — o
 *   desktop (`<nav>` persistente ao lado do wordmark) fica intocado.
 * - cor: ícone em `text-accent` (verde-floresta médio, mesmo token do
 *   wordmark/links de acento sitewide) no estado fechado, com
 *   `hover:text-accent-hover`; no estado aberto (`isOpen`), reaproveita
 *   EXATAMENTE o mesmo par já usado para o item de Categoria ativo
 *   (`bg-accent-subtle text-accent-subtle-fg`, ver `renderCategoryLinks`
 *   acima) — mesma linguagem visual de "estado ativo" já estabelecida,
 *   não uma combinação nova. Nenhum token novo: `accent`/`accent-hover`/
 *   `accent-subtle`/`accent-subtle-fg` já existiam e já tinham consumidor
 *   real antes desta tarefa.
 *
 * Nenhuma animação/transição introduzida — abrir/fechar é estático, mesma
 * decisão já fechada pelo Admin na UXA-019B (se uma transição for
 * desejada no futuro, o padrão já estabelecido no projeto é a variante
 * Tailwind `motion-safe:`, não usada aqui).
 *
 * Sem scroll-lock customizado nesta implementação inicial (decisão
 * fechada no desenho técnico) — o `<dialog>`/`::backdrop` cobrindo o
 * viewport é o único mecanismo. Isto é um critério de aceite MANUAL desta
 * própria tarefa, não uma auditoria automatizada: se a validação em touch
 * real mostrar rolagem perceptível/incômoda do conteúdo atrás do drawer
 * aberto, é uma regressão desta tarefa a ser corrigida aqui antes do
 * aceite, não adiada.
 *
 * `category-nav.module.css` cobre só o que Tailwind não expressa
 * diretamente (`[open]`/`::backdrop`) — mesmo motivo/estrutura do
 * `sidebar-nav.module.css` do Admin. Nenhum primitivo `Dialog`/`Drawer`
 * genérico foi extraído para `packages/ui` nesta tarefa (decisão fechada
 * no desenho técnico — escopo de arquivos da UXW-004 é só este
 * componente).
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const pathname = usePathname();
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  const currentSlug = segments[0];
  const isArticleRoute = segments.length >= 2;

  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const previousPathnameRef = useRef(pathname);

  // Fecha o drawer só quando a navegação realmente ocorre (pathname
  // muda), nunca no clique do link em si — a ref já nasce com o pathname
  // da montagem, então esta primeira execução nunca fecha nada.
  useEffect(() => {
    if (pathname !== previousPathnameRef.current) {
      previousPathnameRef.current = pathname;
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    } else {
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

  // Fecha o drawer ao entrar em `sm+` (640px) enquanto ele está aberto —
  // ver doc comment acima. `typeof window.matchMedia === 'function'` só
  // protege o ambiente de teste (jsdom não implementa `matchMedia`); em
  // qualquer navegador real é sempre verdadeiro.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const desktopQuery = window.matchMedia('(min-width: 640px)');

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches && dialogRef.current?.open) {
        dialogRef.current.close();
      }
    }

    desktopQuery.addEventListener('change', handleDesktopChange);
    return () => {
      desktopQuery.removeEventListener('change', handleDesktopChange);
    };
  }, []);

  function renderCategoryLinks(listClassName: string): ReactNode {
    return (
      <ul className={listClassName}>
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
    );
  }

  return (
    <>
      <button
        type="button"
        className={`sm:hidden ml-auto inline-flex items-center justify-center rounded-control border px-control-x py-control-y focus-visible:outline-none focus-visible:ring-2 ring-focus ${
          isOpen
            ? 'border-transparent bg-accent-subtle text-accent-subtle-fg'
            : 'border-outline bg-surface text-accent hover:text-accent-hover'
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-label="Categorias"
        onClick={() => {
          dialogRef.current?.showModal();
          setIsOpen(true);
        }}
      >
        <HamburgerIcon />
      </button>

      <nav aria-label="Categorias" className="hidden sm:block">
        {renderCategoryLinks('m-0 flex list-none flex-wrap gap-2 p-0')}
      </nav>

      <dialog
        id={drawerId}
        ref={dialogRef}
        aria-label="Categorias"
        onClose={() => setIsOpen(false)}
        className={styles.drawer}
      >
        <button
          type="button"
          autoFocus
          className="self-start rounded-control border border-outline bg-surface px-control-x py-control-y font-ui font-action text-body text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus"
          onClick={() => dialogRef.current?.close()}
        >
          Fechar
        </button>
        <nav aria-label="Categorias">
          {renderCategoryLinks('m-0 flex list-none flex-col gap-1 p-0')}
        </nav>
      </dialog>
    </>
  );
}
