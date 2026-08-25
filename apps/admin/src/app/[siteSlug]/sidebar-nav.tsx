'use client';

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { GuardedLink } from './guarded-link';
import { NAV_DESTINATIONS, navDestinationHref } from './nav-destinations';

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
 *
 * UXA-008 — Adaptação responsiva do shell (drawer abaixo de `lg`).
 *
 * Breakpoint `lg` (1024px, token padrão do Tailwind v4, sem token
 * customizado): medição empírica (Chromium/Playwright, componentes reais
 * `SidebarNav`+`Topbar`, não uma reprodução aproximada) mostrou a
 * composição inline ainda quebrada (nav e Topbar em linhas separadas) em
 * todas as larguras de 320px a 900px — inclusive em ~768px, onde `md`
 * ainda está dentro da faixa quebrada — e estável a partir de ~910px. O
 * próximo breakpoint padrão do Tailwind igual ou acima do cruzamento real
 * é `lg`. Por isso a navegação persistente (`hidden lg:block`) e o
 * trigger do drawer (`lg:hidden`) usam `lg`, nunca `md`.
 *
 * Mesma origem de dados para as duas apresentações: `renderNavList()`
 * mapeia `NAV_DESTINATIONS` uma única vez, chamado tanto para a navegação
 * persistente quanto para o conteúdo do drawer — nunca uma segunda lista
 * divergente. Desde UXA-009, `NAV_DESTINATIONS`/`navDestinationHref` vivem
 * em `nav-destinations.ts`, não mais aqui — a Command Palette se tornou um
 * segundo consumidor real da mesma lista, e mantê-la só neste componente
 * duplicaria exatamente o dado que este comentário já protegia de
 * duplicação interna. Extração sem alteração de comportamento: mesmos 4
 * itens, mesmos rótulos/segmentos, mesma ordem.
 *
 * Drawer via `<dialog>` nativo + `showModal()` (mesmo padrão já
 * comprovado em `unsaved-changes-context.tsx`/UXA-003, com o mesmo
 * polyfill de teste em `jest.setup.ts`, reaproveitado sem alteração):
 * foco preso ao conteúdo do diálogo, `Escape` fecha nativamente, clique
 * fora (no próprio elemento `<dialog>`, isto é, na área do backdrop,
 * nunca em um filho) fecha via `onClick` comparando `event.target`. O
 * botão "Fechar menu" é o primeiro elemento do diálogo e recebe foco
 * inicial via `autoFocus`/`[autofocus]` (comportamento nativo do
 * `showModal()`, sem lógica manual).
 *
 * Nenhuma restauração de foco é feita manualmente aqui — nem para
 * fechamento explícito (botão/Escape/backdrop) nem para fechamento por
 * mudança de `pathname`. Confirmado empiricamente em Chromium (o mesmo
 * usado pelo projeto) que `<dialog>.close()` sempre restaura foco ao
 * elemento que tinha foco no momento de `showModal()` — aqui, o próprio
 * trigger "Menu" — de forma síncrona e nativa, em todos os caminhos de
 * fechamento sem exceção. Aceitar esse comportamento nativo também no
 * fechamento por navegação é uma decisão desta tarefa: uma política
 * própria de foco pós-navegação SPA (por exemplo, focar o heading da
 * página seguinte) é um problema mais amplo do shell, não deste
 * componente, e fica para uma tarefa futura de acessibilidade dedicada a
 * isso — não é antecipada aqui.
 *
 * Fechamento por navegação real, nunca por `onClick` do link: um
 * `useEffect` observa o `pathname` já lido por este componente e só fecha
 * o `<dialog>` quando o valor muda de fato em relação à renderização
 * anterior (uma ref local guarda o valor anterior, inicializada com o
 * próprio `pathname` da montagem — por isso nunca fecha na montagem
 * inicial). Cobre lista/`/new`/detalhe igualmente, porque qualquer
 * navegação real para uma rota diferente muda `pathname`, independente do
 * segmento. Se `GuardedLink` interceptar a navegação por dirty-state e o
 * usuário escolher "Ficar" (`unsaved-changes-context.tsx`), `pathname`
 * nunca muda e o `<dialog>` permanece aberto — nenhuma alteração em
 * `GuardedLink` foi necessária para isso.
 *
 * Fechamento na transição para `lg+` (correção de revisão): um
 * `<dialog>` aberto via `showModal()` continua modal mesmo depois que o
 * CSS passa a ocultar o markup mobile (`lg:hidden`) — sem isto, redimensionar
 * a janela de estreita para `lg+` com o drawer aberto deixaria um modal
 * invisível ainda bloqueando/inertizando o resto da página. Um segundo
 * `useEffect`, local a este componente (nenhuma infraestrutura global de
 * viewport), assina `window.matchMedia('(min-width: 1024px)')` — o mesmo
 * valor de `lg`, sem token novo — via `addEventListener('change', ...)` e
 * fecha o `<dialog>` só se ele estiver aberto no momento em que a media
 * query passa a bater. `removeEventListener` no cleanup evita listener
 * órfão a cada desmonte/remontagem. `typeof window.matchMedia ===
 * 'function'` protege apenas o ambiente de teste (jsdom não implementa
 * `matchMedia` nesta suíte — confirmado empiricamente), no mesmo espírito
 * de `useIsomorphicLayoutEffect` em `unsaved-changes-context.tsx`; em
 * qualquer navegador real a checagem é sempre verdadeira. Confirmado em
 * Chromium real: após a transição, `dialog.open` vira `false`, a
 * navegação desktop fica utilizável (não inert), e o foco — que a
 * restauração nativa tentaria devolver ao trigger "Menu", agora oculto
 * por `lg:hidden` e portanto não focável — cai em `document.body` (nenhum
 * elemento preso), sem travar em nada invisível.
 */
const BUTTON_CLASSES =
  'rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

// Mesmo valor de `lg` usado nas classes Tailwind abaixo — não é um token
// novo, só a forma que `matchMedia` exige para observar a transição.
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export function SidebarNav({ siteSlug }: SidebarNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const previousPathnameRef = useRef(pathname);

  // Fecha o drawer só quando a navegação realmente ocorre (pathname
  // muda), nunca no clique do link — ver doc comment acima. A ref já
  // nasce com o pathname da montagem, então esta primeira execução nunca
  // fecha nada.
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

  // Fecha o drawer ao entrar em `lg+` enquanto ele está aberto — ver doc
  // comment acima. `typeof window.matchMedia === 'function'` só protege o
  // ambiente de teste (jsdom não implementa `matchMedia` nesta suíte); em
  // qualquer navegador real é sempre verdadeiro.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const desktopQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

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

  function renderNavList(listClassName: string): ReactNode {
    return (
      <ul className={listClassName}>
        {NAV_DESTINATIONS.map((item) => {
          const href = navDestinationHref(siteSlug, item.segment);
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
    );
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${BUTTON_CLASSES} lg:hidden`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={drawerId}
        onClick={() => {
          dialogRef.current?.showModal();
          setIsOpen(true);
        }}
      >
        Menu
      </button>

      <nav aria-label="Navegação do Site" className="hidden lg:block">
        {renderNavList('m-0 flex list-none gap-4 p-0')}
      </nav>

      <dialog
        id={drawerId}
        ref={dialogRef}
        aria-label="Menu de navegação"
        onClose={() => setIsOpen(false)}
        onClick={handleBackdropClick}
      >
        <button type="button" autoFocus className={BUTTON_CLASSES} onClick={() => dialogRef.current?.close()}>
          Fechar menu
        </button>
        <nav aria-label="Navegação do Site">{renderNavList('m-0 mt-4 flex list-none flex-col gap-1 p-0')}</nav>
      </dialog>
    </>
  );
}
