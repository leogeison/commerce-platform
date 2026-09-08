'use client';

import type { ArticleAdmin, ArticleStatus } from '@commerce-platform/contracts';
import { STATUS_LABELS } from '../../../../lib/article-labels';
import { ArticleHealthChecklist } from './article-health-checklist';
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
}

const PANEL_HEADING_ID = 'article-context-panel-heading';

/**
 * apps/admin/src/app/[siteSlug]/articles/[id]/article-context-panel.tsx
 *
 * UXE-012 — Painel lateral contextual do Artigo (desktop).
 *
 * Casca de COMPOSIÇÃO/LAYOUT — nunca dono de dado ou regra de negócio.
 * Antes desta tarefa, `ArticleDetail` montava `ArticleHealthChecklist` e
 * `ArticleTransitionPanel` soltos, abaixo do formulário/conteúdo, no
 * mesmo fluxo vertical único. Esta tarefa só recompõe esses dois
 * componentes dentro de uma região lateral sempre visível em desktop —
 * nenhuma prop nova de negócio, nenhuma busca própria, nenhum estado
 * próprio de `/health` ou de transição:
 *
 * - `ArticleHealthChecklist` recebe exatamente as mesmas props que
 *   `ArticleDetail` já calculava (`siteSlug`, `articleId`, `status`,
 *   `refreshKey`) — este componente só as repassa (`healthRefreshKey` →
 *   `refreshKey`), sem interpretar o valor;
 * - `ArticleTransitionPanel` recebe as mesmas `siteSlug`/`articleId`/
 *   `status`/`onTransition` de sempre — `MIN_ROLE_BY_TRANSITION`/
 *   `ACTIONS_BY_STATUS` continuam intocados, dentro daquele componente;
 * - o badge de status reaproveita `STATUS_LABELS` (já existente em
 *   `lib/article-labels.ts`, já usado por `ArticleReadOnly`) — nenhum
 *   rótulo novo. Em composições não-DRAFT, o mesmo rótulo aparece tanto
 *   aqui quanto no resumo (`<dl>`) de `ArticleReadOnly`: duplicação
 *   deliberada (dois lugares com propósito diferente — resumo de
 *   conteúdo vs. painel sempre visível), não um bug; os specs foram
 *   ajustados para essa contagem.
 *
 * Ambos continuam montados exatamente UMA vez cada (só mudou o lugar
 * visual onde renderizam) — nenhuma duplicação de fetch de `/health` ou
 * de estado de transição é introduzida.
 *
 * `ArticleProductsSection`/`ArticleProductsReadOnly` permanecem
 * deliberadamente FORA deste painel — escopo da UXE-014, não desta
 * tarefa. Este componente não os conhece.
 *
 * Landmark `complementary` (`<aside>`), nome acessível via
 * `aria-labelledby` apontando para o heading visível — sem duplicar
 * texto em `aria-label`. A ordem do DOM não muda em relação ao que já
 * existia (o painel continua vindo depois do conteúdo/editor no
 * documento); tornar o painel "lateral" em telas >=1024px é só CSS
 * (`article-context-panel.module.css` + grid de
 * `article-detail.module.css`) — nunca reordenação real do DOM. Isso
 * preserva uma ordem de tab coerente sem exigir nenhum mecanismo de foco
 * especial (foco preso/roving tabindex só entram com o drawer da
 * UXE-013, que não é antecipado aqui).
 *
 * Este componente é local a `apps/admin` por decisão explícita: conhece
 * `Article`/`ArticleStatus`, então nunca pode ser promovido para
 * `packages/ui` (fronteira normativa do pacote — ver seu README).
 */
export function ArticleContextPanel({
  siteSlug,
  articleId,
  status,
  healthRefreshKey,
  onTransition,
}: ArticleContextPanelProps) {
  return (
    <aside className={styles.panel} aria-labelledby={PANEL_HEADING_ID}>
      <h2 id={PANEL_HEADING_ID} className={styles.heading}>
        Status do Artigo
      </h2>
      <p className={styles.statusBadge}>{STATUS_LABELS[status]}</p>
      <ArticleHealthChecklist siteSlug={siteSlug} articleId={articleId} status={status} refreshKey={healthRefreshKey} />
      <ArticleTransitionPanel siteSlug={siteSlug} articleId={articleId} status={status} onTransition={onTransition} />
    </aside>
  );
}
