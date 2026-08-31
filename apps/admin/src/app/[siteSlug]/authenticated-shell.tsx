'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { meResponseSchema, type MeResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import { CommandPalette } from './command-palette';
import { SidebarNav } from './sidebar-nav';
import { SiteRoleProvider } from './site-role-context';
import { Topbar } from './topbar';
import { useUnsavedChangesGuard } from './unsaved-changes-context';
import styles from './authenticated-shell.module.css';

interface AuthenticatedShellProps {
  siteSlug: string;
  children: ReactNode;
}

type ShellState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MeResponse };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar este Site. Tente novamente em instantes.';

/**
 * UXA-011 — skip link.
 *
 * `fixed` + `top-0` combinados com `-translate-y-full`/`focus:translate-y-4`
 * (não uma distância fixa como `-translate-y-24`): `translateY(-100%)` desloca
 * o elemento pela sua PRÓPRIA altura renderizada, então ele fica inteiramente
 * fora da viewport (borda inferior exatamente em `y=0`, nenhum pixel visível)
 * não importa quantas linhas o texto ocupe em zoom alto/reflow — uma
 * distância fixa em rem/px poderia deixar uma fatia visível se o link
 * crescesse além do valor cravado. Ao focar, `focus:translate-y-4` substitui
 * o valor de `translateY` para `1rem` (mesmo token `space-4` usado em
 * `left-4`), pousando o link a `1rem` do topo — nenhuma outra combinação
 * `top-4 + -translate-y-24` (a primeira versão deste desenho) sobrevive a
 * essa correção.
 *
 * `position: fixed` nos dois estados (nunca alternando com `static`/
 * `display: none`) é o que evita layout shift: o link nunca participa do
 * fluxo do `<header>`/`.shell`, então aparecer ao focar nunca empurra nada.
 * `max-w-[calc(100vw-2rem)]` é a mesma garantia aplicada ao eixo horizontal
 * — em reflow a 400% de zoom (viewport efetivo de 320px, WCAG 1.4.10), o
 * texto quebra em vez de vazar para fora da tela.
 *
 * `motion-safe:transition-transform` — mesma convenção já usada em
 * `packages/ui` (`motion-safe:animate-pulse`) para respeitar
 * `prefers-reduced-motion` sem precisar de um branch condicional dedicado.
 *
 * `focus-visible:ring-2 ring-focus` reaproveita o mesmo anel de foco já
 * padronizado no shell (`Topbar`/`SidebarNav`/`CommandPalette`) — nenhuma
 * linguagem visual nova.
 */
const SKIP_LINK_CLASSES =
  'fixed left-4 top-0 z-50 max-w-[calc(100vw-2rem)] -translate-y-full rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg no-underline motion-safe:transition-transform focus:translate-y-4 focus-visible:outline-none focus-visible:ring-2 ring-focus';

/**
 * `siteSlug` (`meResponseSchema`) é `z.string()` puro, sem garantia de
 * formato — mesma cautela de `encodeURIComponent` já aplicada na Home
 * (ADM-003), não é validação nova.
 */
function categoriesHref(siteSlug: string): string {
  return `/${encodeURIComponent(siteSlug)}/categories`;
}

/**
 * Único Client Component do layout autenticado (ADM-004). Chama
 * `GET /admin/auth/me` de forma independente da `Home` (ADM-003) — árvores
 * de rota diferentes, sem Context/store/cache compartilhado (decisão
 * explícita).
 *
 * Validação de `siteSlug` contra `sites[]` é só UX (`router.replace('/')`
 * quando não bate) — nunca substitui `SiteAuthorizationGuard` na API, única
 * autoridade real (Architecture.md §16).
 *
 * `SiteRoleProvider` (ADM-012) envolve só `children` — `currentSite.role` é
 * recalculado a cada render a partir do mesmo `sites[]` já em `state`, sem
 * novo fetch. Como `sites[]` é a lista de vínculos do usuário inteira (não
 * filtrada por Site), ela já contém a Role do próximo `siteSlug` mesmo
 * antes de qualquer nova chamada a `/admin/auth/me` terminar — trocar de
 * Site no seletor atualiza a Role no mesmo render em que `siteSlug` muda.
 * `children` só é alcançável depois de `state.status === 'ready'`, então
 * `useSiteRole()` nunca é chamado fora do Provider por um descendente real
 * desta árvore.
 *
 * `useUnsavedChangesGuard()` (UXA-003) — este componente é filho de
 * `UnsavedChangesProvider` (`layout.tsx`), então pode consumir o guard
 * diretamente: troca de Site e Logout chamam `confirmLeave()` antes de
 * navegar/deslogar, já que nenhum dos dois passa por um `<Link>` (são
 * `router.push`/lógica própria disparados por `<select onChange>`/
 * `<button onClick>`). Os itens de navegação em si (`GuardedLink`,
 * consumindo o mesmo guard) vivem em `SidebarNav` (UXA-006) — este
 * componente não precisa mais de `usePathname()` para si mesmo, já que
 * `SidebarNav` resolve o pathname internamente para o próprio estado
 * ativo/atual.
 *
 * `Topbar` (UXA-007) é puramente apresentacional: `sites`/`siteSlug`/
 * `isLoggingOut`/`logoutError` e os handlers `handleSiteChange`/
 * `handleLogout` (ambos já chamando `confirmLeave()`) continuam aqui,
 * fonte única do fetch de `/admin/auth/me` — reproduzi-los dentro de
 * `Topbar` duplicaria a chamada. `LOGOUT_ERROR_MESSAGE` migrou para
 * `topbar.tsx`, já que a UI que a renderiza (o item "Sair" do menu de
 * usuário) vive inteira lá agora.
 *
 * UXA-019C — `user={state.data.user}` passado a `Topbar` para alimentar a
 * User Pill (nome/inicial). `state.data.user` já vem de `meResponseSchema`
 * (`GET /admin/auth/me`, fetch existente, sem endpoint novo) — nenhum novo
 * estado, `useEffect` ou requisição introduzidos por esta tarefa.
 *
 * `CommandPalette` (UXA-009) — este componente é o dono do estado
 * `isPaletteOpen` (decisão de revisão: sem Context novo). `Topbar` só
 * recebe `onOpenPalette`/`isPaletteOpen`/`paletteId` como props, mesmo
 * padrão já usado para `onSiteChange`/`onLogout`; `CommandPalette` é
 * montado aqui como irmão de `SidebarNav` e do `<header>` que envolve
 * `Topbar` (desde UXA-019B — ver parágrafo próprio abaixo), controlado
 * via `isOpen`/`onOpenChange`. `paletteId` (`useId()`, gerado uma única
 * vez aqui) é a única informação içada a este ancestral comum além do
 * próprio estado — liga `aria-controls` do trigger em `Topbar` ao `id`
 * real do `<dialog>` em `CommandPalette`, sem Context/registro
 * compartilhado. UXA-010: `role={currentSite.role}` é passado direto para
 * `CommandPalette` aqui — mesmo valor já usado por `SiteRoleProvider`
 * acima, sem novo cálculo. `CommandPalette` fica fora da árvore desse
 * Provider (irmão de `<main>`, não descendente), então não pode usar
 * `useSiteRole()`; a prop direta é a forma mínima de levar a Role até lá
 * sem ampliar o Provider nem criar um Context novo.
 *
 * UXA-011 — skip link + landmarks do shell. O link (`SKIP_LINK_CLASSES`,
 * ver doc comment próprio) é o primeiro filho de `.shell`, antes de
 * `SidebarNav`/`<header>` — única forma de garantir que seja a primeira
 * parada de `Tab` em qualquer viewport, já que `position: fixed` não afeta
 * ordem de tabulação (essa segue a ordem do DOM). Só existe no `return` do
 * estado `ready`: os estados `loading`/`error` retornam antes disso (linhas
 * acima) e nunca chegam a montar `SidebarNav`/`<header>`/`<main>` — o skip
 * link nunca apontaria para um `<main>` inexistente.
 *
 * UXA-019B — `SidebarNav` migra de filho de `<header>` para filho direto
 * de `.shell` (`display: grid` desde esta tarefa — ver
 * `authenticated-shell.module.css`), imediatamente antes de `<header>`,
 * que passa a envolver só `Topbar`. Motivo: `SidebarNav` retorna um
 * Fragment com três elementos-irmãos (botão do drawer mobile, `<nav>`
 * persistente, `<dialog>` do drawer) — mantidos como filhos diretos do
 * grid, cada um se posiciona via `grid-area` (definido dentro do próprio
 * `sidebar-nav.tsx`) sem precisar de `display: contents` nem de nenhum
 * wrapper novo: o botão ocupa a área `menu` (mesma linha de `<header>`,
 * que ocupa `topbar`) abaixo de 1024px, reproduzindo a composição
 * horizontal já existente; a partir de 1024px o `<nav>` persistente ocupa
 * a área `rail` (256px, altura cheia), enquanto `<header>`/`<main>`
 * passam a ocupar a coluna principal. A ordem relativa de tabulação
 * (skip link → conteúdo de `SidebarNav` → conteúdo de `Topbar` → `main`)
 * é a mesma de antes desta tarefa — `grid-area` não reordena a sequência
 * de foco, que continua seguindo a ordem do DOM. Nenhuma lógica de
 * `SidebarNav` (drawer, foco, `Escape`, fechamento por navegação/breakpoint)
 * muda por causa deste reposicionamento.
 *
 * `<main>` ganha `id="main-content"` (alvo do `href` do link) e
 * `tabIndex={-1}` (torna um elemento normalmente não-focável em um alvo de
 * foco programável — `<main>` não é focável nativamente sem isso).
 * `handleSkipLinkClick` chama `mainRef.current?.focus()` explicitamente em
 * vez de depender só do salto de âncora nativo: navegadores reais modernos
 * movem o foco para um alvo `tabIndex={-1}` ao navegar para `#id`, mas esse
 * comportamento não é replicado pelo jsdom usado nos testes — o `.focus()`
 * explícito garante o mesmo destino de foco de forma determinística em
 * qualquer engine, sem `preventDefault()`: o `href="#main-content"` continua
 * disparando a navegação de âncora nativa (hash/scroll) em paralelo, como
 * fallback semântico sem JS.
 *
 * Deliberadamente NENHUMA política de foco pós-navegação SPA é introduzida
 * aqui (decisão explícita desta rodada) — `mainRef`/`handleSkipLinkClick`
 * só reagem ao clique/ativação do skip link em si, nunca a uma mudança de
 * `pathname`; este componente continua sem `usePathname()` próprio, mesma
 * decisão já registrada em UXA-006.
 */
export function AuthenticatedShell({ siteSlug, children }: AuthenticatedShellProps) {
  const router = useRouter();
  const { confirmLeave } = useUnsavedChangesGuard();
  const [state, setState] = useState<ShellState>({ status: 'loading' });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const paletteId = useId();
  const mainRef = useRef<HTMLElement>(null);

  function handleSkipLinkClick() {
    mainRef.current?.focus();
  }

  useEffect(() => {
    let cancelled = false;

    apiRequest('/admin/auth/me', meResponseSchema)
      .then((data) => {
        if (cancelled) {
          return;
        }
        const currentSite = data.sites.find((site) => site.siteSlug === siteSlug);
        if (!currentSite) {
          router.replace('/');
          return;
        }
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AdminApiError && error.statusCode === 401) {
          router.replace('/login');
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [router, siteSlug]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }
    if (!(await confirmLeave())) {
      return;
    }
    setIsLoggingOut(true);
    setLogoutError(false);
    try {
      await apiRequest('/admin/auth/logout', z.void(), { method: 'POST' });
      router.replace('/login');
    } catch {
      setLogoutError(true);
      setIsLoggingOut(false);
    }
  }

  async function handleSiteChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSiteSlug = event.target.value;
    if (!(await confirmLeave())) {
      // Componente controlado por `siteSlug` (prop, inalterada aqui) — o
      // próprio React restaura o valor exibido do <select>, sem precisar
      // reverter `event.target.value` manualmente.
      return;
    }
    router.push(categoriesHref(nextSiteSlug));
  }

  if (state.status === 'loading') {
    return <p className={styles.status}>Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className={styles.status}>
        {GENERIC_ERROR_MESSAGE}
      </p>
    );
  }

  const { sites } = state.data;
  // Garantido pelo próprio efeito acima: se `siteSlug` não estivesse em
  // `sites`, já teria disparado `router.replace('/')` antes de chegar a
  // `status: 'ready'`.
  const currentSite = sites.find((site) => site.siteSlug === siteSlug)!;

  return (
    <div className={styles.shell}>
      <a href="#main-content" onClick={handleSkipLinkClick} className={SKIP_LINK_CLASSES}>
        Pular para o conteúdo principal
      </a>

      <SidebarNav siteSlug={siteSlug} />

      <header className={styles.header}>
        <Topbar
          siteSlug={siteSlug}
          sites={sites}
          onSiteChange={handleSiteChange}
          isLoggingOut={isLoggingOut}
          logoutError={logoutError}
          onLogout={handleLogout}
          isPaletteOpen={isPaletteOpen}
          onOpenPalette={() => setIsPaletteOpen(true)}
          paletteId={paletteId}
          user={state.data.user}
        />
      </header>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={styles.content}>
        <SiteRoleProvider value={currentSite.role}>{children}</SiteRoleProvider>
      </main>

      <CommandPalette
        id={paletteId}
        siteSlug={siteSlug}
        role={currentSite.role}
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
      />
    </div>
  );
}
