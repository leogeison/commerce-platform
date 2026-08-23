'use client';

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { z } from 'zod';
import { meResponseSchema, type MeResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import { GuardedLink } from './guarded-link';
import { SiteRoleProvider } from './site-role-context';
import { useUnsavedChangesGuard } from './unsaved-changes-context';
import styles from './authenticated-shell.module.css';

interface AuthenticatedShellProps {
  siteSlug: string;
  children: ReactNode;
}

type ShellState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MeResponse };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar este Site. Tente novamente em instantes.';
const LOGOUT_ERROR_MESSAGE = 'Não foi possível sair. Tente novamente em instantes.';

/**
 * `siteSlug` (`meResponseSchema`) é `z.string()` puro, sem garantia de
 * formato — mesma cautela de `encodeURIComponent` já aplicada na Home
 * (ADM-003), não é validação nova.
 */
function categoriesHref(siteSlug: string): string {
  return `/${encodeURIComponent(siteSlug)}/categories`;
}

const NAV_ITEMS = [
  { label: 'Categorias', segment: 'categories' },
  { label: 'Produtos', segment: 'products' },
  { label: 'Autores', segment: 'authors' },
  { label: 'Artigos', segment: 'articles' },
] as const;

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
 * diretamente: os 4 links de navegação usam `GuardedLink`; troca de Site e
 * Logout chamam `confirmLeave()` antes de navegar/deslogar, já que nenhum
 * dos dois passa por um `<Link>` (são `router.push`/lógica própria
 * disparados por `<select onChange>`/`<button onClick>`).
 */
export function AuthenticatedShell({ siteSlug, children }: AuthenticatedShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { confirmLeave } = useUnsavedChangesGuard();
  const [state, setState] = useState<ShellState>({ status: 'loading' });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

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
        <nav aria-label="Navegação do Site" className={styles.nav}>
          <ul>
            {NAV_ITEMS.map((item) => {
              const href = `/${encodeURIComponent(siteSlug)}/${item.segment}`;
              const isActive = pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <li key={item.segment}>
                  <GuardedLink href={href} aria-current={isActive ? 'page' : undefined}>
                    {item.label}
                  </GuardedLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.controls}>
          <div className={styles.field}>
            <label htmlFor="site-switcher">Site</label>
            <select id="site-switcher" value={siteSlug} onChange={handleSiteChange}>
              {sites.map((site) => (
                <option key={site.siteId} value={site.siteSlug}>
                  {site.siteName}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.logout}>
            <button type="button" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? 'Saindo...' : 'Sair'}
            </button>
            {logoutError && (
              <p role="alert" className={styles.status}>
                {LOGOUT_ERROR_MESSAGE}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className={styles.content}>
        <SiteRoleProvider value={currentSite.role}>{children}</SiteRoleProvider>
      </main>
    </div>
  );
}
