import type { ContextType, ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { SiteRoleProvider } from '../site-role-context';
import { ClicksDashboard } from './clicks-dashboard';

/**
 * UXP-006 — tela do dashboard de cliques com `fetch` simulado. Valida a
 * semântica exibida (eventos × redirecionamentos, sem base de comparação,
 * bots classificados e não excluídos), estados vazio/erro/parcial, uma
 * referência `asOf` única por atualização, filtros na URL e CSV restrito a
 * EDITOR+. Layout real, axe em browser e baselines em `e2e-a11y`/`e2e-visual`.
 */
const mockReplace = jest.fn();
const router: ContextType<typeof AppRouterContext> = {
  back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), push: jest.fn(), replace: mockReplace, prefetch: jest.fn(),
};

const RANGE = {
  period: '7d', timezone: 'America/Sao_Paulo', fromDate: '2026-01-09', toDate: '2026-01-15',
  start: '2026-01-09T03:00:00.000Z', end: '2026-01-15T18:00:00.000Z', asOf: '2026-01-15T18:00:00.000Z',
  isPartial: true, granularity: 'day', previous: { start: '2026-01-02T03:00:00.000Z', end: '2026-01-08T18:00:00.000Z' },
};

function summary(overrides: { events?: number; previousEvents?: number } = {}) {
  const events = overrides.events ?? 12;
  return {
    range: RANGE,
    totals: {
      events, previousEvents: overrides.previousEvents ?? 0, redirected: Math.max(0, events - 2), offerArchived: 1, outcomeNotRecorded: 1,
      likelyBot: 2, noBotIndication: 9, botUnknown: 1, articlesWithClicks: 3, productsWithClicks: 2, offersWithClicks: 4,
    },
    today: { events: 3, yesterdaySameTime: 1 },
    timeseries: ['09/01', '10/01', '11/01', '12/01', '13/01', '14/01', '15/01'].map((label, index) => ({
      start: `2026-01-${String(9 + index).padStart(2, '0')}T03:00:00.000Z`, label, events: index === 6 ? events : 0,
    })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, events: hour === 10 ? events : 0 })),
    byMarketplace: [{ marketplace: 'AMAZON', events }],
    byDevice: [{ device: 'mobile', events }],
  };
}
const RANKINGS = {
  dimension: 'article', totalEvents: 12,
  items: [{ key: '11111111-1111-4111-8111-111111111111', kind: 'entity', label: 'Review do relógio', secondaryLabel: null, events: 12, share: 1 }],
};
const EVENTS = {
  range: RANGE, page: 1, pageSize: 25, total: 1, totalPages: 1,
  items: [{
    id: '22222222-2222-4222-8222-222222222222', clickedAt: '2026-01-15T12:00:00.000Z',
    article: { id: '11111111-1111-4111-8111-111111111111', title: 'Review do relógio' },
    category: { kind: 'entity', name: 'Smartwatches' }, product: { id: '33333333-3333-4333-8333-333333333333', name: 'Relógio X' },
    offerId: '44444444-4444-4444-8444-444444444444', marketplace: 'AMAZON', outcome: 'REDIRECTED', device: 'mobile', botClass: 'no_indication',
    utmSource: null, utmMedium: null, utmCampaign: null,
  }],
};
const OPTIONS = { articles: [], categories: [], products: [], offers: [] };

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(body)) } as Response;
}

let summaryBody: unknown;
let summaryStatus: number;

function installFetch() {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/clicks/summary')) {return jsonResponse(summaryStatus, summaryBody);}
    if (url.includes('/clicks/rankings')) {return jsonResponse(200, RANKINGS);}
    if (url.includes('/clicks/events')) {return jsonResponse(200, EVENTS);}
    if (url.includes('/clicks/filter-options')) {return jsonResponse(200, OPTIONS);}
    return jsonResponse(404, {});
  });
}

function renderDashboard(role: 'VIEWER' | 'EDITOR' | 'OWNER' = 'OWNER', search = '') {
  const wrap = (children: ReactNode) => (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/fastcompre/clicks">
        <SearchParamsContext.Provider value={new URLSearchParams(search) as never}>
          <SiteRoleProvider value={role}>{children}</SiteRoleProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
  return render(wrap(<ClicksDashboard siteSlug="fastcompre" />));
}

function calledUrls(): string[] {
  return (global.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
}

describe('ClicksDashboard (UXP-006)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'], now: new Date('2026-01-15T18:00:00Z') });
  });
  beforeEach(() => {
    summaryBody = summary();
    summaryStatus = 200;
    mockReplace.mockClear();
    installFetch();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('indicadores: eventos registrados × redirecionamentos, sem base de comparação, dados parciais, bots classificados e não excluídos', async () => {
    renderDashboard();
    const kpis = await screen.findByText('Eventos registrados');
    const list = kpis.closest('dl')!;
    expect(within(list).getByText('Redirecionamentos autorizados')).toBeInTheDocument();
    expect(within(list).getByText('Sem base de comparação (período anterior sem eventos)')).toBeInTheDocument();
    expect(screen.getByText(/dados parciais/)).toBeInTheDocument();
    expect(screen.getByText(/2 prováveis bots · 9 sem indício de bot · 1 desconhecidos. Nenhum evento é excluído automaticamente./)).toBeInTheDocument();
    expect(screen.getByText(/não são visitantes únicos, vendas nem conversões/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Origem e campanha' })).toBeInTheDocument();
  });

  it('todas as consultas de uma atualização usam o MESMO asOf; "Atualizar" gera um novo para todas', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard();
    await screen.findByText('Eventos registrados');
    const asOfOf = (url: string) => new URL(url).searchParams.get('asOf');
    const first = calledUrls().filter((url) => !url.includes('filter-options')).map(asOfOf);
    expect(new Set(first).size).toBe(1);

    jest.setSystemTime(new Date('2026-01-15T18:05:00Z'));
    (global.fetch as jest.Mock).mockClear();
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(calledUrls().length).toBeGreaterThanOrEqual(3));
    const second = calledUrls().filter((url) => !url.includes('filter-options')).map(asOfOf);
    expect(new Set(second)).toEqual(new Set(['2026-01-15T18:05:00.000Z']));
  });

  it('filtros persistidos na URL (router.replace) e enviados com o mesmo vocabulário à API', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard('OWNER', 'period=30d&botClass=likely_bot');
    await screen.findByText('Eventos registrados');
    expect(calledUrls().find((url) => url.includes('/summary'))).toMatch(/period=30d.*botClass=likely_bot/);
    await user.selectOptions(screen.getByLabelText('Marketplace (no clique)'), 'SHOPEE');
    expect(mockReplace).toHaveBeenLastCalledWith('/fastcompre/clicks?period=30d&marketplace=SHOPEE&botClass=likely_bot', { scroll: false });
  });

  it('exportar CSV só aparece para EDITOR ou superior', async () => {
    const { unmount } = renderDashboard('VIEWER');
    await screen.findByText('Eventos registrados');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    unmount();
    renderDashboard('EDITOR');
    expect(await screen.findByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('estado vazio e erro com "Tentar novamente"', async () => {
    summaryBody = summary({ events: 0 });
    const { unmount } = renderDashboard();
    expect(await screen.findByText('Nenhum clique registrado no período e filtros selecionados.')).toBeInTheDocument();
    unmount();

    summaryStatus = 500;
    summaryBody = { statusCode: 500, error: 'x', message: 'detalhe interno' };
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os dados. Tente novamente.');
    expect(alert).not.toHaveTextContent('detalhe interno');
    summaryStatus = 200;
    summaryBody = summary();
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Eventos registrados')).toBeInTheDocument();
  });

  it('API sem o endpoint (404) mostra indisponibilidade, nunca a mensagem técnica', async () => {
    summaryStatus = 404;
    summaryBody = { statusCode: 404, error: 'Not Found', message: 'Cannot GET /admin/sites/fastcompre/clicks/summary' };
    renderDashboard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Painel de cliques indisponível no momento. Tente novamente mais tarde.');
    expect(alert).not.toHaveTextContent('Cannot GET');
  });

  it('gráficos com resumo textual e alternativa tabular; histórico com data em Brasília', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard();
    expect(await screen.findByRole('img', { name: /Evolução dos eventos\. Total de 12 eventos; maior valor: 12 em 15\/01\./ })).toBeInTheDocument();
    const toggle = screen.getAllByRole('button', { name: 'Ver como tabela' })[0]!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('table', { name: 'Evolução dos eventos' })).toBeVisible();
    expect(await screen.findByText('15/01/2026, 09:00:00')).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderDashboard();
    await screen.findByText('Review do relógio', { selector: 'th span' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
