'use client';

import { useState } from 'react';
import { articleAdminSchema, type ArticleAdmin, type ArticleStatus, type Role } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { roleMeetsMinimum } from '../../../../lib/role-hierarchy';
import { useSiteRole } from '../../site-role-context';
import styles from './article-transition-panel.module.css';

interface ArticleTransitionPanelProps {
  siteSlug: string;
  articleId: string;
  status: ArticleStatus;
  onTransition: (article: ArticleAdmin) => void;
}

type TransitionKey = 'submit-for-review' | 'revert-to-draft' | 'publish' | 'archive' | 'restore-to-draft';

interface TransitionAction {
  key: TransitionKey;
  label: string;
  pendingLabel: string;
}

const GENERIC_ACTION_ERROR_MESSAGE = 'Não foi possível concluir a ação. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Ações válidas por status (Architecture.md §19 — tabela de transições de
 * `Article`) — único lugar do frontend que conhece a máquina de estados.
 * `DRAFT` entra aqui só para a ação externa "Enviar para revisão" (ADM-010,
 * decisão fechada no desenho técnico) — o restante do modo `DRAFT`
 * (`ArticleForm`, `ArticleProductsSection`) permanece inteiramente fora
 * deste componente, sem nenhuma alteração.
 *
 * `PENDING_REVIEW` tem duas ações (`publish` primeiro, depois
 * `revert-to-draft`) — mesma ordem pedida no desenho técnico.
 */
const ACTIONS_BY_STATUS: Record<ArticleStatus, TransitionAction[]> = {
  DRAFT: [{ key: 'submit-for-review', label: 'Enviar para revisão', pendingLabel: 'Enviando...' }],
  PENDING_REVIEW: [
    { key: 'publish', label: 'Publicar', pendingLabel: 'Publicando...' },
    { key: 'revert-to-draft', label: 'Voltar para rascunho', pendingLabel: 'Voltando...' },
  ],
  PUBLISHED: [{ key: 'archive', label: 'Arquivar', pendingLabel: 'Arquivando...' }],
  ARCHIVED: [{ key: 'restore-to-draft', label: 'Restaurar para rascunho', pendingLabel: 'Restaurando...' }],
};

/**
 * Role mínima por transição (ADM-012; Architecture.md §16 — mesma Role já
 * exigida pelo backend em cada endpoint, `@MinRole` de
 * `articles.controller.ts`/`publish-article.controller.ts`/
 * `archive-article.controller.ts`): `submit-for-review`/`revert-to-draft`/
 * `publish` são fluxo normal de edição (`EDITOR`); `archive`/
 * `restore-to-draft` saem de/para `ARCHIVED`, mesma Role de arquivar/
 * desarquivar em Categoria/Produto/Oferta (`OWNER`). Mapa separado de
 * `ACTIONS_BY_STATUS` de propósito — este só sabe "quem pode", nunca "o
 * que existe para este status" (isso continua sendo só `ACTIONS_BY_STATUS`).
 */
const MIN_ROLE_BY_TRANSITION: Record<TransitionKey, Role> = {
  'submit-for-review': 'EDITOR',
  'revert-to-draft': 'EDITOR',
  publish: 'EDITOR',
  archive: 'OWNER',
  'restore-to-draft': 'OWNER',
};

function transitionPath(siteSlug: string, articleId: string, key: TransitionKey): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}/${key}`;
}

function resolveActionErrorMessage(error: unknown): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return GENERIC_ACTION_ERROR_MESSAGE;
}

/**
 * Painel de transição de status do Artigo (ADM-010) — único componente que
 * chama `POST .../:id/submit-for-review|revert-to-draft|publish|archive|restore-to-draft`
 * (`EDT-012`, `EDT-013`, `REV-003`, `REV-004`, `EDT-016`, todos já
 * existentes, nenhum endpoint novo). Recebe só `status` e devolve o
 * `ArticleAdmin` atualizado via `onTransition` — quem decide a composição
 * seguinte é `ArticleDetail`, nunca este painel.
 *
 * `details.issues` de uma falha `422` de `publish` (checklist de
 * publicação, `APP-002`) NUNCA é lido aqui — só `message`, mesmo padrão de
 * erro já usado em todo o Admin (`resolveActionErrorMessage`). A
 * apresentação granular das pendências é escopo da ADM-011 (`/health`,
 * contrato já tipado), não deste painel.
 *
 * Visibilidade por Role (ADM-012): `MIN_ROLE_BY_TRANSITION` cruza a lista
 * de `ACTIONS_BY_STATUS` do status atual com a Role do usuário
 * (`useSiteRole()`) — só os botões que a Role atual autoriza aparecem. Se
 * nenhuma ação do status sobrar depois do filtro (ex.: `EDITOR` em
 * `PUBLISHED`/`ARCHIVED`, cujas transições exigem `OWNER`), o componente
 * devolve `null` — nunca uma seção vazia. Esconder continua sendo só UX
 * (Architecture.md §16): um clique forçado por fora da UI ainda recebe
 * `403` da própria API, tratado pelo mesmo mecanismo genérico de erro
 * abaixo.
 *
 * `pendingAction` desabilita TODOS os botões enquanto qualquer requisição
 * está em voo (mesmo critério de `isProcessing` em `ArticleProductsSection`)
 * e troca o label só do botão clicado — mesmo padrão de "Salvando..." em
 * `ArticleForm`. Um clique repetido (mesma ação ou outra) é ignorado no
 * início do handler enquanto `pendingAction` não for `null`.
 */
export function ArticleTransitionPanel({ siteSlug, articleId, status, onTransition }: ArticleTransitionPanelProps) {
  const role = useSiteRole();
  const [pendingAction, setPendingAction] = useState<TransitionKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleAction(key: TransitionKey) {
    if (pendingAction) {
      return;
    }
    setActionError(null);
    setPendingAction(key);
    try {
      const article = await apiRequest(transitionPath(siteSlug, articleId, key), articleAdminSchema, {
        method: 'POST',
      });
      onTransition(article);
    } catch (error) {
      setActionError(resolveActionErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  const actions = ACTIONS_BY_STATUS[status].filter((action) => roleMeetsMinimum(role, MIN_ROLE_BY_TRANSITION[action.key]));

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => handleAction(action.key)}
            disabled={pendingAction !== null}
          >
            {pendingAction === action.key ? action.pendingLabel : action.label}
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className={styles.status}>
          {actionError}
        </p>
      )}
    </div>
  );
}
