'use client';

import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from 'react';
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
 * `CommandPalette` (UXA-009) — este componente é o dono do estado
 * `isPaletteOpen` (decisão de revisão: sem Context novo). `Topbar` só
 * recebe `onOpenPalette`/`isPaletteOpen`/`paletteId` como props, mesmo
 * padrão já usado para `onSiteChange`/`onLogout`; `CommandPalette` é
 * montado aqui como um terceiro irmão de `SidebarNav`/`Topbar`, controlado
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
 */
export function AuthenticatedShell({ siteSlug, children }: AuthenticatedShellProps) {
  const router = useRouter();
  const { confirmLeave } = useUnsavedChangesGuard();
  const [state, setState] = useState<ShellState>({ status: 'loading' });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const paletteId = useId();

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
      <header className={styles.header}>
        <SidebarNav siteSlug={siteSlug} />

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
        />
      </header>

      <main className={styles.content}>
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
