'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import type { ArticleAdmin, ArticleStatus } from '@commerce-platform/contracts';
import { STATUS_LABELS } from '../../../../lib/article-labels';
import { usePageModal } from '../../page-modal-context';
import { ArticleHealthChecklist, type HealthSummary } from './article-health-checklist';
import { ArticleTransitionPanel } from './article-transition-panel';
import styles from './article-context-panel.module.css';

interface ArticleContextPanelProps {
  siteSlug: string;
  articleId: string;
  status: ArticleStatus;
  /**
   * Repassado direto para `ArticleHealthChecklist.refreshKey` — este
   * componente não sabe o que é `healthRevision`/quando incrementa, só
   * encaminha o valor que `ArticleDetail` já calculava antes desta tarefa.
   */
  healthRefreshKey: number;
  onTransition: (article: ArticleAdmin) => void;
  /**
   * UXE-013 (ajuste pós-revisão) — ref explícito e tipado, criado e
   * possuído por `ArticleDetail`, apontando para o elemento de fundo
   * (`.content`, o editor/formulário) que deve ficar `inert` enquanto o
   * drawer mobile está aberto. Substitui a versão anterior desta tarefa,
   * que localizava esse elemento via `wrapperRef.current.previousElementSibling`
   * — um acoplamento implícito à ORDEM do DOM em `ArticleDetail` que
   * quebraria silenciosamente (sem erro, só parando de inertizar o
   * elemento certo) se um novo irmão fosse inserido entre os dois no
   * futuro. Quem sabe qual elemento é "o fundo" é `ArticleDetail` — o
   * dono real desse elemento — não este componente; por isso o `ref` é
   * criado lá (`useRef<HTMLDivElement>(null)`, anexado ao mesmo `<div
   * className={styles.content}>` de sempre) e só repassado aqui como
   * prop. Opcional porque nem todo consumidor de teste precisa exercitar
   * esse comportamento (ver `article-context-panel.spec.tsx`) — a
   * ausência do ref (ou de `.current`) faz o efeito de inertização virar
   * no-op, nunca um erro.
   */
  backgroundContentRef?: RefObject<HTMLDivElement | null>;
}

const PANEL_HEADING_ID = 'article-context-panel-heading';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * Escopo do focus trap (ver doc comment principal, seção "mecânica manual
 * de modal"): SÓ dentro do `<aside>` — nunca do wrapper inteiro. O
 * wrapper também contém o trigger externo (`triggerRef`, permanentemente
 * montado desde o ajuste pós-revisão desta tarefa — ver doc comment do
 * componente) e o `<div>` de backdrop; nenhum dos dois deve entrar no
 * ciclo Tab/Shift+Tab do modal, mesmo que `querySelectorAll` os
 * encontrasse estruturalmente (o atributo `inert` no trigger impede foco
 * real do navegador, mas NÃO o remove da árvore que `querySelectorAll`
 * enxerga — por isso a exclusão é por ESCOPO de busca, não por seletor
 * negativo).
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function summaryText(status: ArticleStatus, health: HealthSummary): string {
  const statusLabel = STATUS_LABELS[status];
  if (health.status !== 'ready') {
    return statusLabel;
  }
  if (health.pendingCount === 0) {
    return `${statusLabel} · Sem pendências`;
  }
  if (health.pendingCount === 1) {
    return `${statusLabel} · 1 pendência`;
  }
  return `${statusLabel} · ${health.pendingCount} pendências`;
}

/**
 * apps/admin/src/app/[siteSlug]/articles/[id]/article-context-panel.tsx
 *
 * UXE-012 — Painel lateral contextual do Artigo (desktop). Casca de
 * COMPOSIÇÃO/LAYOUT — nunca dono de dado ou regra de negócio (ver doc
 * comment original da UXE-012, ainda válido: `ArticleHealthChecklist`/
 * `ArticleTransitionPanel` continuam recebendo exatamente as mesmas props
 * de sempre; `ArticleProductsSection`/`ArticleProductsReadOnly`
 * continuam fora deste painel, escopo da UXE-014).
 *
 * UXE-013 — modalidade mobile (<1024px) sem desmontar/remontar nada.
 *
 * Invariante central: `ArticleHealthChecklist` e `ArticleTransitionPanel`
 * são montados exatamente UMA VEZ, dentro do MESMO `<aside>`, em TODAS as
 * três situações (desktop, mobile fechado, mobile aberto). Não existe
 * `<dialog>` para este drawer (investigação da própria UXE-013: o papel
 * ARIA implícito de `<dialog>` é `dialog`, e o único override permitido
 * por HTML-AAM é `alertdialog` — incompatível com a landmark
 * `complementary` exigida em desktop) e não existe portal trocando de
 * target (a documentação oficial do React afirma que "passing a different
 * DOM node during an update will cause the portal content to be
 * recreated" — inaceitável para a mesma invariante). A modalidade mobile
 * é inteiramente manual, local a este componente.
 *
 * Estrutura DOM (raiz única, ver `.root` no CSS — o grid de
 * `article-detail.module.css` espera um único filho direto deste
 * componente na segunda faixa):
 * - `wrapper` (`<div ref={wrapperRef}>`): neutro em desktop e mobile
 *   fechado (sem atributos `role`/`aria-modal`); em mobile aberto ganha
 *   `role="dialog"`, `aria-modal="true"`, `aria-labelledby` — é ele, não
 *   o `<aside>`, quem assume a semântica de modal (troca de atributo,
 *   nunca desmonta os filhos).
 * - trigger (`<button ref={triggerRef}>`): AJUSTE PÓS-REVISÃO — deixou de
 *   ser condicionalmente montado (`{!isMobileOpen && <button>...}`).
 *   Permanece o MESMO elemento React/DOM durante todo o ciclo
 *   abrir→fechar, para que a restauração de foco ao fechar sempre mire
 *   um nó real e nunca dependa de remontagem (ver seção "mecânica manual
 *   de modal" abaixo). Enquanto `isMobileOpen`: `aria-expanded="true"`
 *   continua representado no atributo; o atributo HTML `inert` remove o
 *   trigger do foco/da árvore de acessibilidade/de eventos de clique
 *   (torna-o "acessivelmente indisponível"); visualmente, o mesmo
 *   `.backdrop` que cobre `.content` (`position: fixed; inset: 0;
 *   z-index: 40`) também cobre o trigger — ele fica em fluxo normal
 *   (`z-index: auto`), então o backdrop posicionado sempre pinta por
 *   cima dele nessa faixa de largura, sem precisar de nenhuma classe CSS
 *   extra dedicada a escondê-lo ("apresentação apropriada" reaproveitada,
 *   não uma segunda). `handleOpen` também ignora cliques enquanto já
 *   aberto — mesma defesa dupla (`inert` + guarda no handler) já usada em
 *   `SidebarNav.isInert`, independente de o ambiente de execução (jsdom
 *   nos testes) implementar o bloqueio de eventos do `inert` por completo.
 *   O badge (`<p>`, sem estado, sem foco) permanece condicionalmente
 *   montado só quando `!isMobileOpen` — problema de identidade não se
 *   aplica a um elemento sem estado nem foco.
 * - `<aside ref={asideRef}>`: SEMPRE o mesmo elemento, nunca substituído
 *   por `<dialog>`. `role="complementary"` em desktop e mobile fechado;
 *   `role="none"` em mobile aberto (o wrapper já assumiu a landmark real
 *   de modal — manter `complementary` aninhado dentro de um `dialog`
 *   seria uma landmark redundante/confusa). `ArticleHealthChecklist`/
 *   `ArticleTransitionPanel` vivem exclusivamente aqui dentro, em TODOS
 *   os estados. `asideRef` (novo, ajuste pós-revisão) delimita o escopo
 *   do focus trap — ver `FOCUSABLE_SELECTOR` acima.
 *
 * Indicador externo: `ArticleHealthChecklist.onHealthChange` (UXE-013,
 * opcional) reporta `HealthSummary` para este componente via
 * `handleHealthChange`, memoizado com `useCallback([])` — obrigatório:
 * sem memoização, uma nova identidade de função a cada render disparia o
 * efeito de projeção de `ArticleHealthChecklist` indefinidamente (loop).
 * `summaryText()` combina o rótulo de status (`STATUS_LABELS`, já
 * existente) com a contagem de pendências, seguindo exatamente a
 * convenção de cópia aprovada: loading/error → só status; 0 → "Sem
 * pendências"; 1 → "1 pendência"; N → "N pendências".
 *
 * `PageModalContext` (`usePageModal()`): reporta a `AuthenticatedShell`
 * quando o drawer mobile está aberto, para a shell inertizar sua própria
 * chrome (skip link, `SidebarNav`, `<header>`) e suprimir o atalho global
 * da Command Palette. Efeito com cleanup em TODAS as transições de
 * dependência (não só no unmount) — garante que um unmount inesperado
 * deste componente nunca deixe a shell permanentemente inerte.
 *
 * `.content` (o editor/formulário, elemento de fundo na composição de
 * `ArticleDetail` — fora do escopo original desta tarefa, ampliado por
 * autorização explícita na revisão) é inertizado enquanto o drawer está
 * aberto via `backgroundContentRef` (prop, ver doc comment da interface
 * acima) — nunca por posição relativa no DOM.
 *
 * Mecânica manual de modal (nenhuma dependência nova):
 * - focus trap: `handleTrapKeyDown` recomputa `FOCUSABLE_SELECTOR` dentro
 *   de `asideRef.current` a cada `Tab`, sem cache — o conteúdo interno
 *   pode mudar (loading → ready, ações condicionais por Role). Escopo é
 *   o `<aside>`, não o wrapper inteiro (ver doc comment de
 *   `FOCUSABLE_SELECTOR`).
 * - foco inicial: ao abrir, foco vai para o botão de fechar.
 * - restauração de foco: ao fechar, foco volta para `triggerRef.current`
 *   — o MESMO nó que abriu o drawer, já que o trigger nunca desmonta
 *   (ajuste pós-revisão; antes disso, o trigger era remontado a cada
 *   ciclo e a restauração precisava mirar o nó atual em vez de uma
 *   referência capturada na abertura). `hasOpenedBeforeRef` continua
 *   necessário por um motivo diferente do original: sem ele, este
 *   efeito rodaria já na montagem inicial (quando `isMobileOpen` começa
 *   `false`) e roubaria o foco da página para o trigger no primeiro
 *   render — o guarda garante que a restauração só age depois de uma
 *   abertura real.
 * - `Escape`: listener em `document`, ativo só enquanto `isMobileOpen`.
 * - backdrop: `<div>` com clique fecha o drawer.
 * - scroll lock: captura o `overflow` anterior de `document.body` antes
 *   de travar, restaura o valor exato (nunca uma string vazia fixa) no
 *   cleanup.
 * - resize mobile→desktop com o drawer aberto: o mesmo padrão
 *   `matchMedia('(min-width: 1024px)')` já usado em `sidebar-nav.tsx`
 *   apenas reseta `isMobileOpen` para `false` — nunca desmonta a subtree.
 * - SSR/hydration: `isMobileOpen` começa sempre `false` (mobile-first,
 *   mesma disciplina de `sidebar-nav.tsx`/`topbar.tsx`) — o primeiro
 *   render do servidor e a primeira hidratação no cliente concordam antes
 *   de qualquer efeito rodar.
 *
 * Este componente é local a `apps/admin` por decisão explícita (conhece
 * `Article`/`ArticleStatus` — nunca pode ser promovido para
 * `packages/ui`).
 */
export function ArticleContextPanel({
  siteSlug,
  articleId,
  status,
  healthRefreshKey,
  onTransition,
  backgroundContentRef,
}: ArticleContextPanelProps) {
  const setPageModalOpen = usePageModal();
  const wrapperId = useId();
  const asideId = useId();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [healthSummary, setHealthSummary] = useState<HealthSummary>({ status: 'loading' });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hasOpenedBeforeRef = useRef(false);
  const previousBodyOverflowRef = useRef<string | null>(null);

  const handleHealthChange = useCallback((summary: HealthSummary) => {
    setHealthSummary(summary);
  }, []);

  // Reporta à shell — cleanup em toda transição de dependência (não só no
  // unmount) garante que um unmount inesperado nunca deixe a shell inerte.
  useEffect(() => {
    setPageModalOpen(isMobileOpen);
    return () => {
      setPageModalOpen(false);
    };
  }, [isMobileOpen, setPageModalOpen]);

  // Cruzar para desktop nunca desmonta a subtree — só reseta a modalidade,
  // mesmo padrão de `sidebar-nav.tsx`.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsMobileOpen(false);
      }
    }
    mediaQueryList.addEventListener('change', handleChange);
    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, []);

  // Inertiza o elemento de fundo explícito (`.content` de `ArticleDetail`)
  // — ver doc comment de `backgroundContentRef` acima. Nunca por posição
  // relativa no DOM.
  useEffect(() => {
    const backgroundElement = backgroundContentRef?.current;
    if (!backgroundElement) {
      return;
    }
    if (isMobileOpen) {
      backgroundElement.setAttribute('inert', '');
    } else {
      backgroundElement.removeAttribute('inert');
    }
    return () => {
      backgroundElement.removeAttribute('inert');
    };
  }, [isMobileOpen, backgroundContentRef]);

  // Escape fecha, só enquanto aberto.
  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen]);

  // Scroll lock com restauração exata do valor anterior.
  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflowRef.current ?? '';
    };
  }, [isMobileOpen]);

  // Foco inicial no botão de fechar; restauração no MESMO trigger que
  // abriu o drawer (nunca desmonta — ver doc comment do componente).
  // `hasOpenedBeforeRef` só existe para não roubar o foco no mount inicial.
  useEffect(() => {
    if (isMobileOpen) {
      hasOpenedBeforeRef.current = true;
      closeButtonRef.current?.focus();
    } else if (hasOpenedBeforeRef.current) {
      triggerRef.current?.focus();
    }
  }, [isMobileOpen]);

  function handleOpen() {
    if (isMobileOpen) {
      return;
    }
    setIsMobileOpen(true);
  }

  function handleClose() {
    setIsMobileOpen(false);
  }

  // Ciclo explícito Tab/Shift+Tab, escopado a `asideRef` (nunca ao
  // wrapper inteiro) — ver doc comment de `FOCUSABLE_SELECTOR`.
  function handleTrapKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !asideRef.current) {
      return;
    }
    const focusable = Array.from(asideRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const summary = summaryText(status, healthSummary);

  return (
    <div
      ref={wrapperRef}
      id={wrapperId}
      className={styles.root}
      role={isMobileOpen ? 'dialog' : undefined}
      aria-modal={isMobileOpen ? true : undefined}
      aria-labelledby={isMobileOpen ? PANEL_HEADING_ID : undefined}
      onKeyDown={isMobileOpen ? handleTrapKeyDown : undefined}
    >
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={isMobileOpen}
        aria-controls={asideId}
        inert={isMobileOpen || undefined}
        onClick={handleOpen}
      >
        Status e ações do Artigo
      </button>
      {!isMobileOpen && <p className={styles.statusBadge}>{summary}</p>}
      {isMobileOpen && <div className={styles.backdrop} aria-hidden="true" onClick={handleClose} />}
      <aside
        ref={asideRef}
        id={asideId}
        className={isMobileOpen ? `${styles.panel} ${styles.overlay}` : styles.panel}
        role={isMobileOpen ? 'none' : 'complementary'}
        aria-labelledby={isMobileOpen ? undefined : PANEL_HEADING_ID}
      >
        {isMobileOpen && (
          <button type="button" ref={closeButtonRef} className={styles.closeButton} onClick={handleClose}>
            Fechar Status e ações do Artigo
          </button>
        )}
        <h2 id={PANEL_HEADING_ID} className={styles.heading}>
          Status do Artigo
        </h2>
        <ArticleHealthChecklist
          siteSlug={siteSlug}
          articleId={articleId}
          status={status}
          refreshKey={healthRefreshKey}
          onHealthChange={handleHealthChange}
        />
        <ArticleTransitionPanel siteSlug={siteSlug} articleId={articleId} status={status} onTransition={onTransition} />
      </aside>
    </div>
  );
}
