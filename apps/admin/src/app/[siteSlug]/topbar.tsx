'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent
} from 'react';
import { Search } from 'lucide-react';
import type { AuthUser, MeSiteMembership } from '@commerce-platform/contracts';

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
  /**
   * UXA-019C — `MeResponse.user`, já buscado por `AuthenticatedShell`
   * (nenhum endpoint/fetch novo), repassado como prop para alimentar a
   * User Pill (nome/inicial). Ver `buildTriggerAccessibleName` para a
   * decisão sobre nome acessível do gatilho.
   */
  user: AuthUser;
}

const LOGOUT_ERROR_MESSAGE =
  'Não foi possível sair. Tente novamente em instantes.';

/**
 * UXA-019C — nome de exibição e inicial da User Pill.
 *
 * Microdecisões fechadas no desenho técnico da tarefa (não escolhas
 * livres desta implementação): `user.name` válido após `trim()` é exibido
 * como nome; nome nulo ou vazio após `trim()` exibe o texto estático
 * "Usuário"; a inicial é a primeira letra significativa do nome válido
 * ou, na ausência de nome válido, a primeira letra do `email` (nunca
 * nulo — `authUserSchema` exige `z.string().email()`), sempre em
 * uppercase. `email` nunca é exibido visualmente na pill.
 *
 * Deliberadamente funções locais, não reaproveitando `computeInitials`
 * de `authors/author-avatar.tsx` — aquela regra usa 2 letras (primeira +
 * última palavra), uma decisão de outra tarefa para outro contexto; a
 * regra fechada aqui é sempre 1 letra. Duplicar por regra diferente, não
 * por descuido.
 */
function displayNameFor(user: AuthUser): string {
  const trimmed = user.name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'Usuário';
}

function initialFor(user: AuthUser): string {
  const trimmedName = user.name?.trim() ?? '';
  const source = trimmedName.length > 0 ? trimmedName : user.email;
  return source.charAt(0).toUpperCase();
}

/**
 * Nome acessível do gatilho do menu de usuário: `"Menu do usuário,
 * ${displayName}"`. A User Pill é avatar-only (nenhum texto do nome
 * visível em qualquer largura — ver doc comment do componente), então
 * WCAG 2.5.3 (Label in Name) não se aplica diretamente aqui: o critério
 * exige que o nome acessível contenha o texto visível do controle quando
 * esse texto existe, e não há texto visível a corresponder. O nome
 * completo é incluído mesmo assim porque é a forma mais informativa para
 * leitor de tela/controle por voz identificar o botão. `displayName` já
 * aplica a mesma regra de fallback do nome de exibição ("Usuário" quando
 * não há nome válido).
 */
function buildTriggerAccessibleName(displayName: string): string {
  return `Menu do usuário, ${displayName}`;
}

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
 * Composição responsiva — dois modos, no breakpoint `lg` (1024px), o
 * mesmo em que o shell inteiro vira desktop (`SidebarNav` usa
 * `lg:hidden`/`lg:flex` e `matchMedia('(min-width: 1024px)')`;
 * `authenticated-shell.module.css` muda o grid em `@media (min-width:
 * 1024px)`) — um breakpoint diferente aqui abriria uma faixa
 * intermediária em que a Topbar já parece "desktop" enquanto o resto do
 * shell ainda está em mobile/tablet.
 *
 * Container raiz é `w-full` (ocupa toda a largura do `<header>`) com dois
 * filhos diretos: o wrapper do seletor de Site e um wrapper que agrupa
 * "Busca rápida" + a User Pill.
 *
 * Abaixo de `lg`: o wrapper de Busca+User Pill é uma caixa flex real
 * (`flex gap-0 ml-auto`) — `gap-0` mantém os dois controles colados um ao
 * outro, e `ml-auto` empurra o par inteiro para a extremidade direita da
 * Topbar, deixando hambúrguer (grid area `menu`, `sidebar-nav.tsx`) +
 * seletor de Site agrupados naturalmente à esquerda (ordem do DOM, sem
 * `order`). Busca e Avatar usam `px-2!` — sobrescreve com `!important` o
 * `px-control-x` de `compactIconClasses` para um padding horizontal mais
 * estreito que o padrão de densidade compacta nessa faixa (necessário
 * porque duas utilities Tailwind do mesmo eixo não se resolvem pela
 * ordem em que aparecem no JSX, só por especificidade).
 *
 * A partir de `lg`: o wrapper de Busca+User Pill vira `lg:contents` — não
 * gera caixa própria, e seus dois filhos (botão de Busca, wrapper do
 * Avatar) voltam a participar individualmente do flex do container raiz,
 * na ordem do DOM (depois do Site). O wrapper do Avatar ganha
 * `lg:ml-auto`, empurrando só o avatar para a extremidade direita — Site
 * e Busca ficam colados à esquerda. `lg:px-control-x!` restaura o
 * padding horizontal de Busca/Avatar ao valor do token de densidade
 * nessa largura.
 *
 * Seletor de Site: grupo compacto (`shrink-0`, nunca cresce) com largura
 * máxima fixa (`max-w-40`) em qualquer largura — protege contra
 * `siteName` arbitrariamente longos (o `<select>` nativo corta texto sem
 * reticências quando mais estreito que o conteúdo) sem depender de
 * crescer/encolher conforme o espaço disponível.
 *
 * `data-density="compact"` na raiz aplica a capacidade de densidade de
 * `packages/ui/tokens/spacing.css` (`[data-density='compact']`),
 * reduzindo `--space-control-x`/`--space-control-y` (usados por
 * `px-control-x`/`py-control-y` em `buttonBaseClasses`/
 * `compactIconClasses`) de 16px/12px para 12px/8px via cascata CSS pura
 * — nenhuma mudança em `packages/ui/src/components/button.tsx` (que não
 * tem conhecimento de densidade) nem token novo. Com o avatar de 24px +
 * o padding vertical de 8px, os controles da Topbar resultam em ~40px de
 * altura mínima, acima do mínimo de 24px exigido por WCAG 2.5.8 AA. O
 * padding estrutural do `<header>` também foi reduzido — ver doc comment
 * de `authenticated-shell.module.css` para os valores.
 *
 * User Pill: avatar-only em qualquer largura — o `<button>` do gatilho
 * tem um único filho visual, o avatar com inicial (`aria-hidden="true"`,
 * puramente decorativo). Nome acessível vem só de
 * `aria-label={buildTriggerAccessibleName(displayName)}` (ver doc
 * comment da função) — não há texto visível do nome para computar. Área
 * de toque: o `<button>` mantém o padding de controle ao redor do avatar
 * de 24×24px.
 *
 * Alvo de design: uma linha só em 320/360/390/768px de largura normal;
 * em zoom real 200%/400% múltiplas linhas continuam permitidas e
 * esperadas, sem perda de conteúdo/funcionalidade.
 *
 * Abaixo de `lg`, `<label htmlFor="site-switcher">` some visualmente via
 * `sr-only` (o valor selecionado no `<select>` já comunica o Site
 * atual); o texto permanece no DOM e na árvore de acessibilidade (mesma
 * técnica usada em `command-palette.tsx` para o label de busca). "Busca
 * rápida" segue o mesmo padrão `sr-only`/`lg:not-sr-only`.
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
  user
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
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setIsMenuOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () =>
      document.removeEventListener('mousedown', handleOutsideMouseDown);
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

  // Mesma receita de `buttonBaseClasses`, sem `border`/`bg-surface` abaixo
  // de `lg` (ver doc comment do componente) — restaurada a partir de `lg`
  // via `lg:border lg:border-outline lg:bg-surface`, o mesmo breakpoint em
  // que o shell inteiro vira desktop.
  const compactIconClasses =
    'rounded-control px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus lg:border lg:border-outline lg:bg-surface';

  const displayName = displayNameFor(user);
  const initial = initialFor(user);

  return (
    <div
      data-density="compact"
      className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:gap-4"
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <label
          htmlFor="site-switcher"
          className="sr-only lg:not-sr-only text-body-sm font-ui font-action text-fg"
        >
          Site
        </label>
        <select
          id="site-switcher"
          value={siteSlug}
          onChange={onSiteChange}
          className={`${buttonBaseClasses} min-w-0 max-w-40`}
        >
          {sites.map(site => (
            <option key={site.siteId} value={site.siteSlug}>
              {site.siteName}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0 lg:contents">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isPaletteOpen}
          aria-controls={paletteId}
          aria-keyshortcuts="Meta+K Control+K"
          onClick={onOpenPalette}
          className={`${compactIconClasses} inline-flex shrink-0 items-center gap-2 px-2! lg:px-control-x!`}
        >
          <Search aria-hidden="true" className="shrink-0" />
          <span className="sr-only lg:not-sr-only">Busca rápida</span>
        </button>

        <div className="relative shrink-0 lg:ml-auto">
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label={buildTriggerAccessibleName(displayName)}
            onClick={() => setIsMenuOpen(open => !open)}
            className={`${compactIconClasses} inline-flex items-center px-2! lg:px-control-x!`}
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent font-ui text-body-sm font-action text-fg-on-accent"
            >
              {initial}
            </span>
          </button>
          {isMenuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-labelledby={triggerId}
              onKeyDown={handleMenuKeyDown}
              onBlur={handleMenuBlur}
              className="absolute right-0 z-10 mt-2 min-w-40 rounded-control border border-outline bg-surface p-1 shadow"
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
                <p
                  role="alert"
                  className="px-control-x py-control-y text-body-sm text-fg-danger"
                >
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
