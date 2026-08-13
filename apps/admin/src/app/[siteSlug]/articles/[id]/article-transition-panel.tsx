'use client';

import { useState } from 'react';
import { articleAdminSchema, type ArticleAdmin, type ArticleStatus } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
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
 * Sem leitura de Role do usuário atual (ADM-012, fora de escopo): todos os
 * botões previstos para o status aparecem sempre; um clique sem Role
 * suficiente recebe `403` da própria API, tratado pelo mesmo mecanismo
 * genérico de erro abaixo — nada é escondido antecipadamente na UI
 * (Architecture.md §16: "esconder ações não autorizadas é apenas UX").
 *
 * `pendingAction` desabilita TODOS os botões enquanto qualquer requisição
 * está em voo (mesmo critério de `isProcessing` em `ArticleProductsSection`)
 * e troca o label só do botão clicado — mesmo padrão de "Salvando..." em
 * `ArticleForm`. Um clique repetido (mesma ação ou outra) é ignorado no
 * início do handler enquanto `pendingAction` não for `null`.
 */
export function ArticleTransitionPanel({ siteSlug, articleId, status, onTransition }: ArticleTransitionPanelProps) {
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

  const actions = ACTIONS_BY_STATUS[status];

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
