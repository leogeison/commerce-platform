'use client';

import { useEffect, useState } from 'react';
import {
  articleHealthResponseSchema,
  type ArticleHealthResponse,
  type ArticleStatus,
  type InvalidArticleProduct,
  type InvalidProductReason,
  type ProductAdmin,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { fetchAllProducts } from '../../../../lib/fetch-all-products';
import styles from './article-health-checklist.module.css';

interface ArticleHealthChecklistProps {
  siteSlug: string;
  articleId: string;
  status: ArticleStatus;
  refreshKey: number;
}

type HealthState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; health: ArticleHealthResponse };
type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ProductAdmin[] };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar o checklist de saúde do Artigo.';

/**
 * Framing por status (Architecture.md §32) — mesmo padrão de tabela fixa
 * por status já usado em `ArticleTransitionPanel.ACTIONS_BY_STATUS`.
 * `ARCHIVED` recebe só uma classe CSS de ênfase reduzida (`styles.muted`)
 * mais abaixo — nunca `<details>`/toggle/estado de expandir-recolher
 * (decisão fechada no desenho técnico).
 */
const FRAMING_BY_STATUS: Record<ArticleStatus, string> = {
  DRAFT: 'Preparação do Artigo',
  PENDING_REVIEW: 'Prontidão para publicação',
  PUBLISHED: 'Saúde operacional',
  ARCHIVED: 'Informações de saúde',
};

const INVALID_PRODUCT_REASON_LABELS: Record<InvalidProductReason, string> = {
  NO_OFFERS: 'Sem nenhuma Oferta cadastrada',
  NO_VALID_OFFER: 'Nenhuma Oferta válida (arquivada, fora de estoque ou com link inválido)',
};

function healthPath(siteSlug: string, articleId: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}/health`;
}

/**
 * Conta genericamente quantos dos 6 booleanos do contrato vieram `false`
 * — nenhum campo é tratado como especial ou presumido sempre `true`; a
 * única fonte de verdade sobre o resultado geral continua sendo
 * `health.healthy`, vindo pronto da API.
 */
function countPending(health: ArticleHealthResponse): number {
  const conditions: boolean[] = [
    health.categoryActive,
    health.hasAtLeastOneProduct,
    health.allProductsHaveValidOffer,
    health.slugUnique,
    health.metaDescriptionFilled,
    health.coverImagePresent,
  ];
  return conditions.filter((ok) => !ok).length;
}

function resolveProductLabel(product: InvalidArticleProduct, state: CatalogState): string {
  if (state.status !== 'ready') {
    return product.productId;
  }
  const found = state.items.find((item) => item.id === product.productId);
  return found ? found.name : product.productId;
}

/**
 * Checklist `/health` (ADM-011) — presente em toda composição de
 * `ArticleDetail`, `DRAFT` incluído (Architecture.md §32: "aparece em todo
 * status"). Componente novo e independente, orquestrado por
 * `ArticleDetail` — `ArticleForm`/`ArticleProductsSection`/
 * `ArticleReadOnly`/`ArticleProductsReadOnly`/`ArticleTransitionPanel`
 * continuam sem conhecer `/health`. Nenhum botão/ação aqui — só leitura.
 *
 * As 6 condições e a ordem de exibição seguem Architecture.md §12 (mesma
 * ordem de `collectPublicationIssues` no backend, exceto `WRONG_STATUS`,
 * que nunca entra aqui — o checklist é status-agnóstico por desenho do
 * próprio `CalculateArticleHealthUseCase`).
 *
 * O efeito de saúde depende de `[siteSlug, articleId, status, refreshKey]`:
 * - `status` garante refetch mesmo quando a transição não desmonta o
 *   componente (`PENDING_REVIEW → PUBLISHED` e `PUBLISHED → ARCHIVED`
 *   permanecem no mesmo branch `status !== 'DRAFT'` de `ArticleDetail`,
 *   então React reconcilia em vez de remontar).
 * - `refreshKey` (a `healthRevision` de `ArticleDetail`) garante refetch
 *   depois que o usuário corrige uma pendência em `DRAFT` — PATCH bem-
 *   sucedido do Artigo, vincular ou desvincular Produto com sucesso. Sem
 *   isso, o checklist ficaria obsoleto (ex.: preencher `metaDescription` e
 *   salvar sem o item correspondente virar "OK").
 *
 * O efeito de catálogo (`fetchAllProducts`, só para nomear
 * `invalidProducts`) depende só de `[siteSlug]` — nomes de Produto não
 * mudam por revisão de saúde nem por transição de status.
 */
export function ArticleHealthChecklist({ siteSlug, articleId, status, refreshKey }: ArticleHealthChecklistProps) {
  const fetchKey = `${siteSlug}:${articleId}:${status}:${refreshKey}`;
  const [healthState, setHealthState] = useState<HealthState>({ status: 'loading' });
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' });
  // Ajuste de estado durante a renderização (não dentro do efeito, para não
  // disparar `react-hooks/set-state-in-effect`): sempre que `fetchKey` muda
  // — `status`/`refreshKey` incluídos — o checklist volta a "Carregando..."
  // já no mesmo ciclo de render, antes do efeito abaixo buscar `/health`
  // de novo. Padrão oficial do React para "resetar estado quando uma prop
  // muda" (react.dev, "Storing information from previous renders").
  const [loadedForKey, setLoadedForKey] = useState(fetchKey);
  if (loadedForKey !== fetchKey) {
    setLoadedForKey(fetchKey);
    setHealthState({ status: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;

    apiRequest(healthPath(siteSlug, articleId), articleHealthResponseSchema)
      .then((health) => {
        if (!cancelled) {
          setHealthState({ status: 'ready', health });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, articleId, status, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    fetchAllProducts(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCatalogState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  const heading = FRAMING_BY_STATUS[status];
  const sectionClassName = status === 'ARCHIVED' ? `${styles.section} ${styles.muted}` : styles.section;

  if (healthState.status === 'loading') {
    return (
      <div className={sectionClassName}>
        <h2>{heading}</h2>
        <p className={styles.status}>Carregando checklist...</p>
      </div>
    );
  }

  if (healthState.status === 'error') {
    return (
      <div className={sectionClassName}>
        <h2>{heading}</h2>
        <p role="alert" className={styles.status}>
          {GENERIC_LOAD_ERROR_MESSAGE}
        </p>
      </div>
    );
  }

  const { health } = healthState;
  const pendingCount = countPending(health);

  return (
    <div className={sectionClassName}>
      <h2>{heading}</h2>
      <p className={styles.summary}>
        {health.healthy ? 'Sem pendências.' : `${pendingCount} pendência(s) encontrada(s).`}
      </p>

      <ul className={styles.items}>
        <li className={styles.item}>
          <ChecklistItemRow label="Categoria ativa" ok={health.categoryActive} />
        </li>
        <li className={styles.item}>
          <ChecklistItemRow label="Ao menos um Produto vinculado" ok={health.hasAtLeastOneProduct} />
        </li>
        <li className={styles.item}>
          <ChecklistItemRow label="Todos os Produtos com Oferta válida" ok={health.allProductsHaveValidOffer} />
          {!health.allProductsHaveValidOffer && health.invalidProducts.length > 0 && (
            <ul className={styles.subItems}>
              {health.invalidProducts.map((invalidProduct) => (
                <li key={invalidProduct.productId}>
                  {resolveProductLabel(invalidProduct, catalogState)} —{' '}
                  {INVALID_PRODUCT_REASON_LABELS[invalidProduct.reason]}
                </li>
              ))}
            </ul>
          )}
        </li>
        <li className={styles.item}>
          <ChecklistItemRow label="Slug único" ok={health.slugUnique} />
        </li>
        <li className={styles.item}>
          <ChecklistItemRow label="Meta description preenchida" ok={health.metaDescriptionFilled} />
        </li>
        <li className={styles.item}>
          <ChecklistItemRow label="Capa presente" ok={health.coverImagePresent} />
        </li>
      </ul>
    </div>
  );
}

function ChecklistItemRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={styles.itemRow}>
      <span>{label}</span>
      <span className={ok ? styles.ok : styles.pending}>{ok ? 'OK' : 'Pendente'}</span>
    </span>
  );
}
