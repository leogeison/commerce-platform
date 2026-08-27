'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listArticlesResponseSchema, type ArticleSummaryAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import { EmptyState, ErrorState, LoadingState } from './async-state';

interface DashboardProps {
  siteSlug: string;
}

type DraftsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ArticleSummaryAdmin[] };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar os rascunhos. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Quantidade fixa desta seção (UXA-017) — não há quantidade normativa
 * definida no backlog para "Continuar de onde parei" (verificado contra
 * `UX-Implementation-Backlog.md`/`Architecture.md` antes da implementação:
 * nenhum dos dois documenta um número). Decisão de produto explícita desta
 * tarefa: 5 rascunhos mais recentemente atualizados — "seção operacional de
 * retomada, não uma segunda listagem de Artigos" (`ArticleList` já cobre a
 * listagem completa, com paginação e `PAGE_SIZE = 20`). Sem paginação nem
 * "Ver todos" aqui: um 6º rascunho em edição simplesmente não aparece até
 * ser atualizado ou sair do top-5 por `updatedAt desc`, comportamento
 * aceito, não uma pendência técnica.
 */
const DRAFTS_LIMIT = 5;

function resolveErrorMessage(error: unknown): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * `orderBy=updatedAt_desc` (UXA-017, exposto no boundary HTTP por esta
 * mesma tarefa — `listArticlesQuerySchema`) é o motivo real da
 * dependência desta tarefa em UXF-012: sem ele, a única ordenação
 * disponível seria `createdAt desc`, que não reflete "onde parei" (um
 * rascunho antigo editado agora não subiria ao topo). `status=DRAFT` e
 * `pageSize=5` são fixos — sem filtro nem paginação nesta seção.
 */
function buildDraftsPath(siteSlug: string): string {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', String(DRAFTS_LIMIT));
  params.set('status', 'DRAFT');
  params.set('orderBy', 'updatedAt_desc');
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles?${params.toString()}`;
}

function articleHref(siteSlug: string, articleId: string): string {
  return `/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}`;
}

/**
 * `Intl.DateTimeFormat('pt-BR', ...)` — nenhum utilitário de formatação de
 * data existe hoje em `apps/admin/src` (só `apps/fastcompre`, fora deste
 * app); instanciado uma vez, fora do componente, reaproveitado por
 * renderização — `Intl.DateTimeFormat` é seguro para reuso (sem estado
 * mutável entre chamadas de `.format()`). Data absoluta (dia/mês/ano +
 * hora/minuto), não relativa ("há 2 dias") — decisão desta tarefa: nenhum
 * componente de tempo relativo existe no projeto, e introduzir um seria
 * escopo além do pedido.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatUpdatedAt(updatedAt: string): string {
  return DATE_FORMATTER.format(new Date(updatedAt));
}

/**
 * UXA-017 — Dashboard do Admin, seção "Continuar de onde parei" (única
 * seção desta tarefa; `PENDING_REVIEW`/`PUBLISHED`, atalhos de criação e
 * tratamento de falha parcial multi-seção pertencem a UXA-018/019, fora de
 * escopo aqui — este componente tem uma seção só, então "falha parcial
 * entre seções" ainda não se aplica).
 *
 * Região identificável (`aria-labelledby`) apontando para o próprio
 * heading da seção — mesmo padrão que UXA-019 vai estender para as demais
 * seções quando elas existirem, sem antecipar a estrutura delas aqui.
 *
 * Estados assíncronos reaproveitados de `async-state.tsx` sem alteração —
 * mesmo padrão de `AuthorList`/`ArticleList`. Vazio usa texto puramente
 * contextual ("Nenhum rascunho em andamento."), sem nenhum CTA de criação
 * — atalhos role-gated são UXA-019.
 */
export function Dashboard({ siteSlug }: DashboardProps) {
  const [state, setState] = useState<DraftsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest(buildDraftsPath(siteSlug), listArticlesResponseSchema)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', items: data.items });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: resolveErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  return (
    <section aria-labelledby="dashboard-drafts-heading" className="flex flex-col gap-4">
      <h2 id="dashboard-drafts-heading" className="m-0 font-ui text-lg font-action text-fg">
        Continuar de onde parei
      </h2>

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' &&
        (state.items.length === 0 ? (
          <EmptyState>Nenhum rascunho em andamento.</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {state.items.map((article) => (
              <li key={article.id} className="flex flex-col gap-1">
                <Link href={articleHref(siteSlug, article.id)}>{article.title}</Link>
                <span className="font-ui text-body-sm text-fg-muted">
                  Atualizado em {formatUpdatedAt(article.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
