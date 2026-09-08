'use client';

import { createContext, useContext, type ReactNode } from 'react';

type SetPageModalOpen = (isOpen: boolean) => void;

const PageModalContext = createContext<SetPageModalOpen | null>(null);

interface PageModalProviderProps {
  setPageModalOpen: SetPageModalOpen;
  children: ReactNode;
}

/**
 * apps/admin/src/app/[siteSlug]/page-modal-context.tsx
 *
 * UXE-013 — sinal mínimo entre uma página e `AuthenticatedShell`.
 *
 * Este Context carrega SÓ um setter (`isOpen: boolean`) — nenhum dado de
 * saúde, Artigo, drawer, focus trap ou regra de domínio. Fluxo em uma
 * única direção (página → shell): o único consumidor esperado hoje é
 * `ArticleContextPanel` (via `usePageModal()`), informando que o drawer
 * mobile do painel contextual do Artigo está aberto — nenhum consumidor
 * lê o estado de volta por aqui, só escreve.
 *
 * `AuthenticatedShell` é quem possui o `useState` real (`isPageModalOpen`)
 * e o usa para inertizar sua própria chrome (skip link, `SidebarNav` via
 * a prop `isInert`, `<header>`) e para gatear o atalho global da Command
 * Palette (`suppressShortcut`) — ver `authenticated-shell.tsx`. Este
 * arquivo não conhece nenhum desses efeitos, só transporta o booleano.
 *
 * Deliberadamente NÃO um `ModalManager`/registry: não suporta múltiplos
 * modais simultâneos nem prioridade entre eles — um único booleano, uma
 * única direção de fluxo. Se um segundo caso de uso precisar de mais do
 * que isso no futuro, é uma tarefa própria, não uma extensão silenciosa
 * deste Context.
 */
export function PageModalProvider({ setPageModalOpen, children }: PageModalProviderProps) {
  return <PageModalContext.Provider value={setPageModalOpen}>{children}</PageModalContext.Provider>;
}

/**
 * Só pode ser chamado por um descendente de `AuthenticatedShell` (dentro
 * de `<PageModalProvider>`, montado ao redor de `{children}` de `<main>`).
 * O `throw` documenta esse invariante estrutural — mesmo padrão de
 * `useSiteRole()` (`site-role-context.tsx`).
 */
export function usePageModal(): SetPageModalOpen {
  const setPageModalOpen = useContext(PageModalContext);
  if (!setPageModalOpen) {
    throw new Error('usePageModal só pode ser usado dentro de AuthenticatedShell.');
  }
  return setPageModalOpen;
}
