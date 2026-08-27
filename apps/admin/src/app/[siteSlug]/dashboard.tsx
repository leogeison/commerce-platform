'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listArticlesResponseSchema,
  type ArticleStatus,
  type ArticleSummaryAdmin,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import { EmptyState, ErrorState, LoadingState } from './async-state';

interface DashboardProps {
  siteSlug: string;
}

type ArticleListSectionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ArticleSummaryAdmin[] };

const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Quantidade fixa das três seções (UXA-017, estendida pela UXA-018) — não
 * há quantidade normativa definida no backlog para nenhuma delas
 * (verificado contra `UX-Implementation-Backlog.md`/`Architecture.md`
 * antes de cada uma das duas tarefas: nenhum dos dois documenta um
 * número). Decisão de produto explícita: 5 itens por seção — "seções
 * operacionais de retomada/acompanhamento, não uma segunda listagem de
 * Artigos" (`ArticleList` já cobre a listagem completa, com paginação e
 * `PAGE_SIZE = 20`). Sem paginação nem "Ver todos" em nenhuma das três: um
 * 6º item simplesmente não aparece até um dos 5 sair do topo pela
 * ordenação da seção, comportamento aceito, não uma pendência técnica.
 */
const SECTION_ITEMS_LIMIT = 5;

function resolveErrorMessage(error: unknown, genericMessage: string): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return genericMessage;
}

/**
 * `status` fixo por seção, `pageSize` fixo (`SECTION_ITEMS_LIMIT`) e sem
 * filtro/paginação — mesmo shape de query string das três seções, só
 * `orderBy` varia (presente para "Continuar de onde parei"/"Publicados
 * recentemente", ausente para "Aguardando publicação", que usa o default
 * já existente do repository). Generaliza o que UXA-017 tinha como
 * `buildDraftsPath` — a query string resultante para `status=DRAFT` com
 * `orderBy='updatedAt_desc'` é byte a byte idêntica à daquela tarefa
 * (`page=1&pageSize=5&status=DRAFT&orderBy=updatedAt_desc`), preservando o
 * contrato já validado manualmente.
 */
function buildSectionPath(
  siteSlug: string,
  status: ArticleStatus,
  orderBy?: 'updatedAt_desc' | 'publishedAt_desc',
): string {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', String(SECTION_ITEMS_LIMIT));
  params.set('status', status);
  if (orderBy !== undefined) {
    params.set('orderBy', orderBy);
  }
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles?${params.toString()}`;
}

function articleHref(siteSlug: string, articleId: string): string {
  return `/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}`;
}

/**
 * `Intl.DateTimeFormat('pt-BR', ...)` — nenhum utilitário de formatação de
 * data existe hoje em `apps/admin/src` (só `apps/fastcompre`, fora deste
 * app); instanciado uma vez, fora do componente, reaproveitado por
 * renderização e pelas três seções — `Intl.DateTimeFormat` é seguro para
 * reuso (sem estado mutável entre chamadas de `.format()`). Data absoluta
 * (dia/mês/ano + hora/minuto), não relativa ("há 2 dias") — decisão da
 * UXA-017, mantida: nenhum componente de tempo relativo existe no
 * projeto, e introduzir um seria escopo além do pedido.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(isoDate));
}

/**
 * Hook privado de fetch/estado, compartilhado pelas três seções (UXA-018 —
 * extração aprovada por ser, ela mesma, o segundo consumidor real do
 * padrão que a UXA-017 estabeleceu para "Continuar de onde parei"; mesmo
 * princípio já usado no projeto para `packages/ui` — promover só quando
 * um segundo consumidor real comprova o reuso — aplicado aqui à escala do
 * próprio componente, não de um pacote). Deliberadamente privado a este
 * arquivo, não movido para `lib/`: nenhuma seção fora do Dashboard usa
 * esta mecânica hoje.
 *
 * Cada chamada deste hook mantém seu próprio estado (`useState` próprio,
 * não compartilhado entre seções) e seu próprio efeito — três chamadas no
 * corpo do `Dashboard` disparam três fetches paralelos, sem waterfall
 * (nenhuma depende da conclusão de outra) e sem que a falha de uma seção
 * alcance as outras duas: o `.catch` de cada seção só atualiza o estado
 * daquela própria seção. O teste formal dedicado a esse isolamento
 * ("uma seção falha, as outras continuam legíveis") fica para UXA-019,
 * cujo critério de aceite é esse — aqui cada seção só prova seu próprio
 * error state individualmente.
 */
function useArticleListSection(
  siteSlug: string,
  status: ArticleStatus,
  orderBy: 'updatedAt_desc' | 'publishedAt_desc' | undefined,
  genericErrorMessage: string,
): ArticleListSectionState {
  const [state, setState] = useState<ArticleListSectionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest(buildSectionPath(siteSlug, status, orderBy), listArticlesResponseSchema)
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
        setState({ status: 'error', message: resolveErrorMessage(error, genericErrorMessage) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, status, orderBy, genericErrorMessage]);

  return state;
}

const DRAFTS_ERROR_MESSAGE = 'Não foi possível carregar os rascunhos. Tente novamente em instantes.';
const PENDING_REVIEW_ERROR_MESSAGE =
  'Não foi possível carregar os Artigos aguardando publicação. Tente novamente em instantes.';
const PUBLISHED_ERROR_MESSAGE =
  'Não foi possível carregar os Artigos publicados recentemente. Tente novamente em instantes.';

interface ArticleListSectionProps {
  headingId: string;
  title: string;
  state: ArticleListSectionState;
  emptyMessage: string;
  siteSlug: string;
  /**
   * `undefined` = item sem linha secundária de data (ver "Aguardando
   * publicação" abaixo). Retorno `null` do próprio formatador = mesma
   * ausência de linha para aquele item específico (só usado por
   * "Publicados recentemente", ver `Dashboard`, para o caso defensivo de
   * `publishedAt` nulo — que a invariante de publicação não deveria
   * permitir para um Artigo `PUBLISHED`, mas que este componente não
   * mascara com outro campo/data incorreta).
   */
  formatSecondaryLine?: (article: ArticleSummaryAdmin) => string | null;
}

/**
 * Markup comum às três seções — região identificável (`aria-labelledby`)
 * apontando para o próprio heading, mesmo padrão que UXA-019 vai estender
 * quando adicionar atalhos/estados de falha parcial, sem antecipar essa
 * estrutura aqui. A linha secundária de data é opcional por seção: só
 * "Continuar de onde parei" e "Publicados recentemente" têm um timestamp
 * real e relevante para mostrar (`updatedAt`/`publishedAt`); "Aguardando
 * publicação" não tem nenhum timestamp que represente "entrou em
 * revisão" — mostrar `createdAt` sob esse rótulo seria dado real com
 * legenda enganosa, e nenhum texto foi inventado para preencher essa
 * lacuna (decisão explícita desta tarefa).
 */
function ArticleListSection({
  headingId,
  title,
  state,
  emptyMessage,
  siteSlug,
  formatSecondaryLine,
}: ArticleListSectionProps) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="m-0 font-ui text-lg font-action text-fg">
        {title}
      </h2>

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' &&
        (state.items.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {state.items.map((article) => {
              const secondaryLine = formatSecondaryLine?.(article) ?? null;
              return (
                <li key={article.id} className="flex flex-col gap-1">
                  <Link href={articleHref(siteSlug, article.id)}>{article.title}</Link>
                  {secondaryLine !== null && (
                    <span className="font-ui text-body-sm text-fg-muted">{secondaryLine}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/**
 * UXA-017/UXA-018 — Dashboard do Admin, três seções: "Continuar de onde
 * parei" (`DRAFT`, `updatedAt desc`, UXA-017), "Aguardando publicação"
 * (`PENDING_REVIEW`, `createdAt desc` — default existente, sem `orderBy`
 * novo) e "Publicados recentemente" (`PUBLISHED`, `publishedAt desc` —
 * extensão mínima de `orderBy` autorizada nesta tarefa, ver
 * `ArticleListOrderBy`/`findManyBySite`). Atalhos de criação role-gated e
 * tratamento formal de falha parcial multi-seção pertencem a UXA-019, fora
 * de escopo aqui.
 *
 * Layout (UXA-018): "Continuar de onde parei" em destaque/largura
 * principal; "Aguardando publicação" e "Publicados recentemente" em grid
 * de duas colunas no desktop (`lg:grid-cols-2`), uma coluna no mobile —
 * ordem do DOM sempre Continuar → Aguardando → Publicados, igual à ordem
 * visual (nenhum CSS de reordenação).
 */
export function Dashboard({ siteSlug }: DashboardProps) {
  const draftsState = useArticleListSection(siteSlug, 'DRAFT', 'updatedAt_desc', DRAFTS_ERROR_MESSAGE);
  const pendingReviewState = useArticleListSection(
    siteSlug,
    'PENDING_REVIEW',
    undefined,
    PENDING_REVIEW_ERROR_MESSAGE,
  );
  const publishedState = useArticleListSection(
    siteSlug,
    'PUBLISHED',
    'publishedAt_desc',
    PUBLISHED_ERROR_MESSAGE,
  );

  return (
    <div className="flex flex-col gap-8">
      <ArticleListSection
        headingId="dashboard-drafts-heading"
        title="Continuar de onde parei"
        state={draftsState}
        emptyMessage="Nenhum rascunho em andamento."
        siteSlug={siteSlug}
        formatSecondaryLine={(article) => `Atualizado em ${formatDate(article.updatedAt)}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ArticleListSection
          headingId="dashboard-pending-review-heading"
          title="Aguardando publicação"
          state={pendingReviewState}
          emptyMessage="Nenhum Artigo aguardando publicação."
          siteSlug={siteSlug}
        />

        <ArticleListSection
          headingId="dashboard-published-heading"
          title="Publicados recentemente"
          state={publishedState}
          emptyMessage="Nenhum Artigo publicado recentemente."
          siteSlug={siteSlug}
          formatSecondaryLine={(article) =>
            article.publishedAt ? `Publicado em ${formatDate(article.publishedAt)}` : null
          }
        />
      </div>
    </div>
  );
}
