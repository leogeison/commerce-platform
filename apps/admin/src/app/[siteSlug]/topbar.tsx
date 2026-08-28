'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { Search, UserRound } from 'lucide-react';
import type { MeSiteMembership } from '@commerce-platform/contracts';

interface TopbarProps {
  siteSlug: string;
  sites: MeSiteMembership[];
  onSiteChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  isLoggingOut: boolean;
  logoutError: boolean;
  onLogout: () => void;
  isPaletteOpen: boolean;
  onOpenPalette: () => void;
  paletteId: string;
}

const LOGOUT_ERROR_MESSAGE = 'Não foi possível sair. Tente novamente em instantes.';

/**
 * UXA-007 — Topbar de contexto global.
 *
 * Puramente apresentacional: `AuthenticatedShell` continua sendo o único
 * ponto que busca `/admin/auth/me` e guarda `sites`/`isLoggingOut`/
 * `logoutError`; `handleSiteChange`/`handleLogout` (com `confirmLeave()`)
 * também permanecem lá, inalterados — este componente só recebe e delega.
 * Reproduzir o fetch aqui duplicaria a chamada, o que o "Fora de escopo"
 * da tarefa (não alterar a lógica de troca de Site) protege implicitamente.
 *
 * `LOGOUT_ERROR_MESSAGE` migrou de `authenticated-shell.tsx` para cá — a
 * UI que a renderiza agora vive inteira aqui; `GENERIC_ERROR_MESSAGE`
 * (erro do próprio shell, sem relação com logout) permanece no shell.
 *
 * Trigger da Command Palette — habilitado nesta rodada (UXA-009): o
 * controle deixa de ser `disabled` e passa a abrir `CommandPalette` via
 * `onOpenPalette` (callback recebido de `AuthenticatedShell`, que também
 * é quem monta a instância de `CommandPalette` e possui `isPaletteOpen`
 * — nenhum Context novo, mesmo padrão já usado para `onSiteChange`/
 * `onLogout`). `aria-controls={paletteId}` aponta para o `id` real do
 * `<dialog>` da paleta — `paletteId` é gerado uma única vez em
 * `AuthenticatedShell` (ancestral comum) e passado como prop para os dois
 * lados, a forma mínima de ligação explícita entre trigger e diálogo sem
 * criar Context/registro compartilhado. `aria-keyshortcuts` já pode ser
 * estático agora — o atalho global (`Ctrl+K`/`Cmd+K`, implementado dentro
 * de `CommandPalette`) passa a existir de fato nesta mesma tarefa.
 *
 * Menu de usuário — padrão `aria-haspopup="menu"`/`role="menu"` mínimo e
 * local a este componente (sem primitiva nova em `packages/ui`, sem
 * segundo consumidor comprovado):
 * - abre por clique ou `Enter`/`Space` nativos do botão-gatilho; foco vai
 *   para o item "Sair" ao abrir (único item hoje);
 * - `Escape` fecha e devolve foco ao gatilho;
 * - clique fora fecha (listener de `mousedown` no `document`, ignorando
 *   cliques no próprio gatilho — que já alterna o menu via seu `onClick`,
 *   evitando o bug clássico de "fecha e reabre" na mesma interação);
 * - `Tab` para fora fecha via `onBlur` do container, checando
 *   `relatedTarget`: quando `relatedTarget` é `null` (foco perdido sem um
 *   alvo definido, não uma saída real via Tab) o menu **não** fecha — é
 *   exatamente o que acontece quando o item "Sair" vira `disabled` no meio
 *   do clique (o navegador derruba o foco para `document.body` sem
 *   `relatedTarget`); tratar isso como "saiu do menu" fecharia o menu no
 *   meio do logout, escondendo o estado de carregamento/erro;
 * - ativar "Sair" chama `onLogout` (idêntico ao `handleLogout` existente)
 *   e **não fecha o menu automaticamente** — `isLoggingOut`/`logoutError`
 *   continuam sendo renderizados dentro do próprio menu, exatamente como
 *   hoje aparecem soltos na topbar, só que agora dentro do disclosure; em
 *   sucesso, o redirect desmonta a árvore inteira e o estado do menu se
 *   torna irrelevante, em falha o menu permanece aberto mostrando o
 *   alerta para nova tentativa.
 *
 * Classes utilitárias replicam deliberadamente a mesma receita visual de
 * `packages/ui/src/components/button.tsx` (variant secondary) sem
 * importar `Button` diretamente — `Button` não expõe `forwardRef` hoje, e
 * o gatilho/o item de menu precisam de `ref` para gestão de foco; alterar
 * `Button` para isso está fora do escopo aprovado desta tarefa.
 *
 * UXA-019B (refinamento) — toolbar compacta abaixo de `lg`.
 *
 * Container raiz trocou `flex-wrap` solto por dois grupos (`Site` à
 * esquerda, `Busca rápida`+`Menu do usuário` à direita) com
 * `justify-between`, mantendo `flex-wrap` no nível externo como rede de
 * segurança de reflow (não removido — só reorganizado em dois grupos).
 * Alvo de design: uma linha só em 320/360/390/768px de largura normal;
 * em zoom real 200%/400% múltiplas linhas continuam permitidas e
 * esperadas, sem perda de conteúdo/funcionalidade.
 *
 * Abaixo de `sm` (640px, breakpoint padrão do Tailwind, sem token novo):
 * `<label htmlFor="site-switcher">` some visualmente via `sr-only` (o
 * próprio valor selecionado no `<select>` já comunica o Site atual) e o
 * `<select>` ganha `max-w-[6rem]` (era `max-w-[12rem]` incondicional);
 * "Busca rápida"/"Menu do usuário" trocam texto visível por
 * `<Icon aria-hidden="true" />` + `<span className="sr-only">`. A partir
 * de `sm`, tudo volta ao texto visível (`sm:not-sr-only`,
 * `sm:max-w-[12rem]`) — mesma largura/apresentação de antes desta rodada.
 * Em todos os casos o nome acessível de cada controle continua
 * exatamente o mesmo texto de antes ("Site", "Busca rápida", "Menu do
 * usuário") — `sr-only` oculta só visualmente, o texto permanece no DOM e
 * na árvore de acessibilidade (mesma técnica já usada em
 * `command-palette.tsx` para o label de busca). Nenhuma prop, handler,
 * `id`/`aria-*`, ordem de tabulação ou lógica de abrir/fechar/Escape/
 * clique-fora/`onBlur` deste componente muda.
 */
export function Topbar({
  siteSlug,
  sites,
  onSiteChange,
  isLoggingOut,
  logoutError,
  onLogout,
  isPaletteOpen,
  onOpenPalette,
  paletteId,
}: TopbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoutItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isMenuOpen) {
      logoutItemRef.current?.focus();
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleOutsideMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsMenuOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [isMenuOpen]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setIsMenuOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleMenuBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next && !event.currentTarget.contains(next)) {
      setIsMenuOpen(false);
    }
  }

  const buttonBaseClasses =
    'rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor="site-switcher" className="sr-only sm:not-sr-only text-body-sm font-ui font-action text-fg">
          Site
        </label>
        <select
          id="site-switcher"
          value={siteSlug}
          onChange={onSiteChange}
          className={`${buttonBaseClasses} max-w-[6rem] sm:max-w-[12rem]`}
        >
          {sites.map((site) => (
            <option key={site.siteId} value={site.siteSlug}>
              {site.siteName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isPaletteOpen}
          aria-controls={paletteId}
          aria-keyshortcuts="Meta+K Control+K"
          onClick={onOpenPalette}
          className={`${buttonBaseClasses} inline-flex items-center gap-2`}
        >
          <Search aria-hidden="true" className="shrink-0" />
          <span className="sr-only sm:not-sr-only">Busca rápida</span>
        </button>

        <div className="relative">
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
            className={`${buttonBaseClasses} inline-flex items-center gap-2`}
          >
            <UserRound aria-hidden="true" className="shrink-0" />
            <span className="sr-only sm:not-sr-only">Menu do usuário</span>
          </button>
          {isMenuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-labelledby={triggerId}
              onKeyDown={handleMenuKeyDown}
              onBlur={handleMenuBlur}
              className="absolute right-0 z-10 mt-2 min-w-[10rem] rounded-control border border-outline bg-surface p-1 shadow"
            >
              <button
                ref={logoutItemRef}
                type="button"
                role="menuitem"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="w-full rounded-control px-control-x py-control-y text-left text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingOut ? 'Saindo...' : 'Sair'}
              </button>
              {logoutError && (
                <p role="alert" className="px-control-x py-control-y text-body-sm text-fg-danger">
                  {LOGOUT_ERROR_MESSAGE}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
