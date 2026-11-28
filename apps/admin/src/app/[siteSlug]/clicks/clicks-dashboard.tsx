'use client';

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Download, Info, RefreshCw } from 'lucide-react';
import { Button, Text } from '@commerce-platform/ui';
import {
  clickEventsResponseSchema,
  clickFilterOptionsResponseSchema,
  clickRankingsResponseSchema,
  clickSummaryResponseSchema,
  marketplaceSchema,
  type ClickDimension,
  type ClickEventsResponse,
  type ClickFilterOptionsResponse,
  type ClickFiltersQuery,
  type ClickRankingsResponse,
  type ClickSummaryResponse,
} from '@commerce-platform/contracts';
import { apiDownload, apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { roleMeetsMinimum } from '../../../lib/role-hierarchy';
import { useSiteRole } from '../site-role-context';
import { BarList, ColumnChart } from './click-charts';
import {
  BOT_LABELS,
  DEVICE_LABELS,
  DIMENSION_LABELS,
  FILTER_KEYS,
  MARKETPLACE_LABELS,
  OUTCOME_LABELS,
  PERIOD_OPTIONS,
  apiQuery,
  describeComparison,
  filtersFromSearchParams,
  formatCount,
  formatDateTime,
  formatLocalDate,
  formatShare,
  formatTime,
  marketplaceLabel,
} from './click-format';

/**
 * UXP-006 — dashboard de cliques de afiliados.
 *
 * - Filtros na URL (compartilháveis, "voltar" funciona); `asOf` (referência
 *   única de "agora") é definido a cada atualização e enviado a TODAS as
 *   consultas dessa atualização — summary, rankings, eventos e CSV usam o
 *   mesmo instante.
 * - Semântica exibida: eventos registrados ≠ redirecionamentos autorizados;
 *   cliques não são visitantes, vendas ou conversões; bots classificados,
 *   não excluídos; origem/campanha ainda não capturada (sem gráfico vazio).
 * - Exportação CSV só para EDITOR ou superior (a API também exige).
 */

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

const GENERIC_ERROR = 'Não foi possível carregar os dados. Tente novamente.';

/**
 * 404 = endpoint ausente (ex.: Admin já publicado pela Vercel antes do deploy
 * manual da API — ver runbook §7) ou Site inexistente: mensagem de
 * indisponibilidade, nunca o texto técnico do framework.
 */
const UNAVAILABLE_ERROR = 'Painel de cliques indisponível no momento. Tente novamente mais tarde.';

function errorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError) || error.statusCode === undefined || error.statusCode >= 500) {
    return GENERIC_ERROR;
  }
  return error.statusCode === 404 ? UNAVAILABLE_ERROR : error.message;
}

/**
 * Carrega dados para a chave `requestKey` (filtros + `asOf` + paginação).
 * "Carregando" é DERIVADO (a última resposta é de outra chave), sem
 * `setState` síncrono no efeito; respostas de chaves antigas são
 * descartadas (`active`).
 */
function useLoad<T>(requestKey: string, fetcher: () => Promise<T>): [Load<T>, () => void] {
  const [result, setResult] = useState<{ key: string; load: Load<T> } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = `${requestKey}#${nonce}`;
  useEffect(() => {
    let active = true;
    fetcher().then(
      (data) => active && setResult({ key, load: { status: 'ready', data } }),
      (error) => active && setResult({ key, load: { status: 'error', message: errorMessage(error) } }),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const load: Load<T> = result && result.key === key ? result.load : { status: 'loading' };
  return [load, () => setNonce((value) => value + 1)];
}

function Section({ title, description, children, id }: { title: string; description?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} id={id} className="rounded-control border border-outline bg-surface p-4 sm:p-5">
      <h2 id={headingId} className="m-0 font-ui text-body font-action text-fg">
        {title}
      </h2>
      {description && <p className="mb-0 mt-1 font-ui text-body-sm text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StateMessage({ load, onRetry }: { load: Load<unknown>; onRetry: () => void }) {
  if (load.status === 'loading') {
    return (
      <p role="status" className="m-0 font-ui text-body-sm text-fg-muted">
        Carregando…
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 font-ui text-body-sm text-fg-danger">
        <span>{load.message}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  return null;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-outline bg-surface p-4">
      <dt className="font-ui text-body-sm text-fg-muted">{label}</dt>
      <dd className="m-0 font-ui text-2xl font-semibold tabular-nums text-fg">{value}</dd>
      {detail && <dd className="m-0 font-ui text-body-sm text-fg-secondary">{detail}</dd>}
    </div>
  );
}

function ComparisonText({ current, previous }: { current: number; previous: number }) {
  const comparison = describeComparison(current, previous);
  const Icon = comparison.tone === 'up' ? ArrowUp : comparison.tone === 'down' ? ArrowDown : null;
  return (
    <span className="inline-flex items-center gap-1">
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      {comparison.text}
    </span>
  );
}

const SELECT_CLASS =
  'h-10 w-full rounded-control border border-outline bg-surface px-2 font-ui text-body-sm text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-ui text-body-sm font-action text-fg">
        {label}
      </label>
      <select id={id} className={SELECT_CLASS} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ClicksDashboard({ siteSlug }: { siteSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const role = useSiteRole();
  const canExport = roleMeetsMinimum(role, 'EDITOR');

  const filters = useMemo(() => filtersFromSearchParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const [dimension, setDimension] = useState<ClickDimension>('article');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'clickedAt_desc' | 'clickedAt_asc'>('clickedAt_desc');
  const [customFrom, setCustomFrom] = useState(filters.from ?? '');
  const [customTo, setCustomTo] = useState(filters.to ?? '');
  const [exportState, setExportState] = useState<{ status: 'idle' | 'working' } | { status: 'error'; message: string }>({
    status: 'idle',
  });

  const base = `/admin/sites/${encodeURIComponent(siteSlug)}/clicks`;

  const updateFilters = useCallback(
    (changes: Partial<ClickFiltersQuery>) => {
      const next = new URLSearchParams();
      const merged = { ...filters, ...changes };
      for (const key of FILTER_KEYS) {
        const value = merged[key];
        if (value !== undefined && value !== null && value !== '' && !(key === 'period' && value === '7d')) {
          if ((key === 'from' || key === 'to') && merged.period !== 'custom') {
            continue;
          }
          next.set(key, String(value));
        }
      }
      setAsOf(new Date().toISOString());
      setPage(1);
      router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const summaryPath = `${base}/summary?${apiQuery(filters, asOf)}`;
  const rankingPath = `${base}/rankings?${apiQuery(filters, asOf, { dimension, limit: 10 })}`;
  const eventsPath = `${base}/events?${apiQuery(filters, asOf, { page, pageSize: 25, sort })}`;
  const optionsPath = `${base}/filter-options`;
  const [summary, retrySummary] = useLoad<ClickSummaryResponse>(summaryPath, () =>
    apiRequest(summaryPath, clickSummaryResponseSchema),
  );
  const [ranking, retryRanking] = useLoad<ClickRankingsResponse>(rankingPath, () =>
    apiRequest(rankingPath, clickRankingsResponseSchema),
  );
  const [events, retryEvents] = useLoad<ClickEventsResponse>(eventsPath, () =>
    apiRequest(eventsPath, clickEventsResponseSchema),
  );
  const [options] = useLoad<ClickFilterOptionsResponse>(optionsPath, () =>
    apiRequest(optionsPath, clickFilterOptionsResponseSchema),
  );

  const optionLists = options.status === 'ready' ? options.data : { articles: [], categories: [], products: [], offers: [] };
  const toOptions = (items: Array<{ id: string; label: string }>) => items.map((item) => ({ value: item.id, label: item.label }));
  const hasActiveFilters = FILTER_KEYS.some((key) => key !== 'period' && key !== 'from' && key !== 'to' && filters[key]);

  async function handleExport() {
    setExportState({ status: 'working' });
    try {
      const { blob, filename } = await apiDownload(`${base}/export.csv?${apiQuery(filters, asOf)}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? 'cliques.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportState({ status: 'idle' });
    } catch (error) {
      setExportState({ status: 'error', message: errorMessage(error) });
    }
  }

  const range = summary.status === 'ready' ? summary.data.range : null;
  const totals = summary.status === 'ready' ? summary.data.totals : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-ui text-2xl font-semibold text-fg">Cliques de afiliados</h1>
          <p className="mb-0 mt-1 max-w-2xl font-ui text-body-sm text-fg-muted">
            Eventos registrados pelo redirecionador de ofertas. Cliques não são visitantes únicos, vendas nem conversões.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 font-ui text-body-sm text-fg-muted" aria-live="polite">
            Dados até {formatTime(asOf)} (horário de Brasília)
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAsOf(new Date().toISOString())} className="inline-flex items-center gap-2">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Atualizar
          </Button>
          {canExport && (
            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={exportState.status === 'working'}
              className="inline-flex items-center gap-2"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {exportState.status === 'working' ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          )}
        </div>
      </header>
      {exportState.status === 'error' && (
        <p role="alert" className="m-0 font-ui text-body-sm text-fg-danger">
          {exportState.message}
        </p>
      )}

      <Section title="Filtros">
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 font-ui text-body-sm font-action text-fg">Período</legend>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => {
                const checked = filters.period === option.value;
                return (
                  <label
                    key={option.value}
                    className={`inline-flex min-h-10 cursor-pointer items-center rounded-control border px-3 font-ui text-body-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${checked ? 'border-accent bg-accent-subtle font-action text-accent-subtle-fg' : 'border-outline bg-surface text-fg'}`}
                  >
                    <input
                      type="radio"
                      name="click-period"
                      value={option.value}
                      checked={checked}
                      onChange={() =>
                        option.value === 'custom'
                          ? updateFilters({ period: 'custom', from: customFrom || undefined, to: customTo || undefined })
                          : updateFilters({ period: option.value })
                      }
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {filters.period === 'custom' && (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                updateFilters({ period: 'custom', from: customFrom || undefined, to: customTo || undefined });
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="click-from" className="font-ui text-body-sm font-action text-fg">
                  De
                </label>
                <input id="click-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className={SELECT_CLASS} required />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="click-to" className="font-ui text-body-sm font-action text-fg">
                  Até
                </label>
                <input id="click-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className={SELECT_CLASS} required />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Aplicar período
              </Button>
              <p className="m-0 w-full font-ui text-body-sm text-fg-muted">Até 366 dias, datas no horário de Brasília.</p>
            </form>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="Artigo" value={filters.articleId} options={toOptions(optionLists.articles)} onChange={(value) => updateFilters({ articleId: value })} />
            <FilterSelect label="Categoria do artigo (no clique)" value={filters.categoryId} options={toOptions(optionLists.categories)} onChange={(value) => updateFilters({ categoryId: value })} />
            <FilterSelect label="Produto" value={filters.productId} options={toOptions(optionLists.products)} onChange={(value) => updateFilters({ productId: value })} />
            <FilterSelect label="Oferta" value={filters.offerId} options={toOptions(optionLists.offers)} onChange={(value) => updateFilters({ offerId: value })} />
            <FilterSelect
              label="Marketplace (no clique)"
              value={filters.marketplace}
              options={marketplaceSchema.options.map((value) => ({ value, label: MARKETPLACE_LABELS[value] }))}
              onChange={(value) => updateFilters({ marketplace: value as ClickFiltersQuery['marketplace'] })}
            />
            <FilterSelect
              label="Resultado"
              value={filters.outcome}
              options={Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(value) => updateFilters({ outcome: value as ClickFiltersQuery['outcome'] })}
            />
            <FilterSelect
              label="Classificação de bot"
              value={filters.botClass}
              options={Object.entries(BOT_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(value) => updateFilters({ botClass: value as ClickFiltersQuery['botClass'] })}
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasActiveFilters}
                onClick={() =>
                  updateFilters({
                    articleId: undefined,
                    categoryId: undefined,
                    productId: undefined,
                    offerId: undefined,
                    marketplace: undefined,
                    outcome: undefined,
                    botClass: undefined,
                  })
                }
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {summary.status !== 'ready' ? (
        <Section title="Indicadores">
          <StateMessage load={summary} onRetry={retrySummary} />
        </Section>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="m-0 font-ui text-body-sm text-fg-secondary">
              Período: {formatLocalDate(range!.fromDate)} a {formatLocalDate(range!.toDate)}
              {range!.isPartial && (
                <>
                  {' '}
                  · <strong className="font-action">dados parciais</strong> (inclui o dia em andamento, até {formatTime(range!.asOf)})
                </>
              )}
            </p>
            <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                label="Eventos registrados"
                value={formatCount(totals!.events)}
                detail={<ComparisonText current={totals!.events} previous={totals!.previousEvents} />}
              />
              <Kpi
                label="Redirecionamentos autorizados"
                value={formatCount(totals!.redirected)}
                detail={`${formatCount(totals!.offerArchived)} em ofertas arquivadas · ${formatCount(totals!.outcomeNotRecorded)} sem resultado registrado`}
              />
              <Kpi
                label="Hoje"
                value={formatCount(summary.data.today.events)}
                detail={`Ontem até o mesmo horário: ${formatCount(summary.data.today.yesterdaySameTime)}`}
              />
              <Kpi
                label="Com eventos no período"
                value={`${formatCount(totals!.articlesWithClicks)} artigos`}
                detail={`${formatCount(totals!.productsWithClicks)} produtos · ${formatCount(totals!.offersWithClicks)} ofertas`}
              />
            </dl>
            <p className="m-0 font-ui text-body-sm text-fg-muted">
              Classificação por user-agent: {formatCount(totals!.likelyBot)} prováveis bots · {formatCount(totals!.noBotIndication)} sem indício de bot ·{' '}
              {formatCount(totals!.botUnknown)} desconhecidos. Nenhum evento é excluído automaticamente.
            </p>
          </div>

          {totals!.events === 0 ? (
            <Section title="Sem eventos">
              <Text className="m-0">Nenhum clique registrado no período e filtros selecionados.</Text>
            </Section>
          ) : (
            <>
              <Section
                title="Evolução dos eventos"
                description={range!.granularity === 'hour' ? 'Por hora (horário de Brasília).' : 'Por dia (horário de Brasília). Dias sem eventos aparecem como zero.'}
              >
                <ColumnChart
                  title="Evolução dos eventos"
                  data={summary.data.timeseries.map((bucket) => ({ key: bucket.start, label: bucket.label, value: bucket.events }))}
                />
              </Section>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Section title="Por marketplace" description="Marketplace registrado no momento do clique.">
                  <BarList
                    title="Eventos por marketplace"
                    data={summary.data.byMarketplace.map((item) => ({
                      key: item.marketplace ?? 'not_recorded',
                      label: marketplaceLabel(item.marketplace),
                      value: item.events,
                    }))}
                  />
                </Section>
                <Section title="Por dispositivo" description="Derivado do user-agent (classificação aproximada).">
                  <BarList
                    title="Eventos por dispositivo"
                    data={summary.data.byDevice.map((item) => ({ key: item.device, label: DEVICE_LABELS[item.device], value: item.events }))}
                  />
                </Section>
                <Section title="Por horário do dia" description="Horário de Brasília, somando todos os dias do período.">
                  <ColumnChart
                    title="Eventos por horário do dia"
                    maxXLabels={6}
                    data={summary.data.byHour.map((item) => ({ key: String(item.hour), label: `${String(item.hour).padStart(2, '0')}h`, value: item.events }))}
                  />
                </Section>
              </div>
            </>
          )}

          <Section
            title="Origem e campanha"
            description="Ainda não capturadas com confiabilidade: o link do artigo não repassa os parâmetros de campanha da visita. Por isso não há gráfico nem ranking de origem."
          >
            <p className="m-0 flex items-start gap-2 font-ui text-body-sm text-fg-secondary">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Os campos utm_* aparecem no histórico somente quando presentes no próprio link de redirecionamento.
            </p>
          </Section>
        </>
      )}

      <Section title="Rankings" description="Top 10 do período, com os mesmos filtros. Categoria = categoria do artigo no momento do clique.">
        <fieldset className="m-0 border-0 p-0">
          <legend className="sr-only">Dimensão do ranking</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIMENSION_LABELS) as ClickDimension[]).map((value) => (
              <label
                key={value}
                className={`inline-flex min-h-10 cursor-pointer items-center rounded-control border px-3 font-ui text-body-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${dimension === value ? 'border-accent bg-accent-subtle font-action text-accent-subtle-fg' : 'border-outline bg-surface text-fg'}`}
              >
                <input type="radio" name="click-dimension" value={value} checked={dimension === value} onChange={() => setDimension(value)} className="sr-only" />
                {DIMENSION_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          {ranking.status !== 'ready' ? (
            <StateMessage load={ranking} onRetry={retryRanking} />
          ) : ranking.data.items.length === 0 ? (
            <Text className="m-0">Nenhum evento no período.</Text>
          ) : (
            <div role="region" aria-label={`Ranking de ${DIMENSION_LABELS[dimension].toLowerCase()}`} tabIndex={0} className="overflow-x-auto rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus">
              <table className="w-full border-collapse font-ui text-body-sm">
                <caption className="sr-only">Ranking de {DIMENSION_LABELS[dimension].toLowerCase()} por eventos</caption>
                <thead>
                  <tr className="border-b border-outline">
                    <th scope="col" className="w-10 py-2 pr-2 text-left font-action text-fg">#</th>
                    <th scope="col" className="py-2 pr-2 text-left font-action text-fg">{DIMENSION_LABELS[dimension].slice(0, -1)}</th>
                    <th scope="col" className="py-2 pr-2 text-right font-action text-fg">Eventos</th>
                    <th scope="col" className="py-2 text-right font-action text-fg">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.data.items.map((item, index) => (
                    <tr key={`${item.kind}-${item.key ?? index}`} className="border-b border-outline-subtle">
                      <td className="py-2 pr-2 tabular-nums text-fg-muted">{index + 1}</td>
                      <th scope="row" className="py-2 pr-2 text-left font-normal text-fg">
                        <span className={item.kind === 'entity' ? '' : 'italic text-fg-secondary'}>{item.label}</span>
                        {item.secondaryLabel && <span className="block text-fg-muted">{item.secondaryLabel}</span>}
                      </th>
                      <td className="py-2 pr-2 text-right tabular-nums text-fg">{formatCount(item.events)}</td>
                      <td className="py-2 text-right tabular-nums text-fg-secondary">{formatShare(item.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <Section title="Histórico de eventos" description="Cada linha é um evento registrado pelo redirecionador (horário de Brasília).">
        {events.status !== 'ready' ? (
          <StateMessage load={events} onRetry={retryEvents} />
        ) : events.data.total === 0 ? (
          <Text className="m-0">Nenhum evento no período.</Text>
        ) : (
          <>
            <p className="mb-2 mt-0 font-ui text-body-sm text-fg-muted lg:hidden">Role a tabela horizontalmente para ver todas as colunas.</p>
            <div role="region" aria-label="Tabela do histórico de eventos" tabIndex={0} className="overflow-x-auto rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus">
              <table className="w-full min-w-[60rem] border-collapse font-ui text-body-sm">
                <caption className="sr-only">Eventos de clique, {formatCount(events.data.total)} no total</caption>
                <thead>
                  <tr className="border-b border-outline">
                    <th scope="col" aria-sort={sort === 'clickedAt_desc' ? 'descending' : 'ascending'} className="py-2 pr-3 text-left">
                      <button
                        type="button"
                        onClick={() => {
                          setSort(sort === 'clickedAt_desc' ? 'clickedAt_asc' : 'clickedAt_desc');
                          setPage(1);
                        }}
                        className="inline-flex items-center gap-1 rounded-control font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus"
                      >
                        Data e hora
                        {sort === 'clickedAt_desc' ? <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />}
                        <span className="sr-only">{sort === 'clickedAt_desc' ? ' (mais recentes primeiro; ativar para inverter)' : ' (mais antigos primeiro; ativar para inverter)'}</span>
                      </button>
                    </th>
                    {['Artigo', 'Categoria (no clique)', 'Produto', 'Marketplace (no clique)', 'Resultado', 'Dispositivo', 'Bot', 'UTM'].map((header) => (
                      <th key={header} scope="col" className="py-2 pr-3 text-left font-action text-fg">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((event) => (
                    <tr key={event.id} className="border-b border-outline-subtle align-top">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-fg">{formatDateTime(event.clickedAt)}</td>
                      <td className="py-2 pr-3 text-fg">{event.article?.title ?? <span className="italic text-fg-secondary">Sem artigo (link direto)</span>}</td>
                      <td className="py-2 pr-3 text-fg">
                        {event.category.kind === 'entity' ? (
                          (event.category.name ?? 'Categoria removida')
                        ) : (
                          <span className="italic text-fg-secondary">
                            {event.category.kind === 'no_article' ? '—' : event.category.kind === 'no_category' ? 'Sem categoria' : 'Não registrada'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-fg">{event.product.name}</td>
                      <td className="py-2 pr-3 text-fg">{marketplaceLabel(event.marketplace)}</td>
                      <td className="py-2 pr-3 text-fg">{OUTCOME_LABELS[event.outcome]}</td>
                      <td className="py-2 pr-3 text-fg">{DEVICE_LABELS[event.device]}</td>
                      <td className="py-2 pr-3 text-fg">{BOT_LABELS[event.botClass]}</td>
                      <td className="py-2 pr-3 text-fg-secondary">
                        {[event.utmSource, event.utmMedium, event.utmCampaign].some(Boolean)
                          ? [event.utmSource, event.utmMedium, event.utmCampaign].map((value) => value ?? '—').join(' / ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Paginação do histórico" className="mt-4 flex flex-wrap items-center justify-between gap-3 font-ui text-body-sm text-fg-secondary">
              <span>
                Página {events.data.page} de {Math.max(1, events.data.totalPages)} · {formatCount(events.data.total)} eventos
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={page >= events.data.totalPages} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </nav>
          </>
        )}
      </Section>
    </div>
  );
}
