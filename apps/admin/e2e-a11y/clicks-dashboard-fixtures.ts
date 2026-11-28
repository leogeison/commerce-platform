import type { Page, Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';
import { ME_RESPONSE, SITE_SLUG, mockEmptyCategoriesAndAuthors, mockMe } from './fixtures';

/**
 * UXP-006 — API simulada (determinística) do dashboard de cliques, para os
 * specs de browser real (`clicks-dashboard.a11y.spec.ts`,
 * `clicks-dashboard-presentation.spec.ts`) e o baseline visual
 * (`../e2e-visual/clicks-dashboard.visual.spec.ts`). Dados fictícios de
 * apresentação — a precisão das agregações é coberta pelos e2e da API com
 * Postgres real (`apps/api/test/click-analytics.e2e-spec.ts`).
 */

/** Relógio fixo do navegador: 15/01/2026 15:00 em Brasília. */
export const FIXED_NOW = new Date('2026-01-15T18:00:00.000Z');

const ARTICLES = [
  { id: '51000000-0000-4000-8000-000000000001', label: 'Amazfit Bip 6 vale a pena?' },
  { id: '51000000-0000-4000-8000-000000000002', label: 'Melhores smartwatches até R$ 500' },
  { id: '51000000-0000-4000-8000-000000000003', label: 'Logitech K380: análise completa' },
];
const PRODUCTS = [
  { id: '52000000-0000-4000-8000-000000000001', label: 'Amazfit Bip 6' },
  { id: '52000000-0000-4000-8000-000000000002', label: 'Logitech K380' },
];

const DAILY = [9, 14, 11, 16, 12, 19, 13];

function range(period: string) {
  return {
    period,
    timezone: 'America/Sao_Paulo',
    fromDate: '2026-01-09',
    toDate: '2026-01-15',
    start: '2026-01-09T03:00:00.000Z',
    end: FIXED_NOW.toISOString(),
    asOf: FIXED_NOW.toISOString(),
    isPartial: true,
    granularity: 'day',
    previous: { start: '2026-01-02T03:00:00.000Z', end: '2026-01-08T18:00:00.000Z' },
  };
}

export function summaryFixture(empty = false) {
  const total = empty ? 0 : DAILY.reduce((sum, value) => sum + value, 0);
  return {
    range: range('7d'),
    totals: {
      events: total,
      previousEvents: empty ? 0 : 81,
      redirected: empty ? 0 : total - 3,
      offerArchived: empty ? 0 : 1,
      outcomeNotRecorded: empty ? 0 : 2,
      likelyBot: empty ? 0 : 4,
      noBotIndication: empty ? 0 : total - 6,
      botUnknown: empty ? 0 : 2,
      articlesWithClicks: empty ? 0 : 3,
      productsWithClicks: empty ? 0 : 2,
      offersWithClicks: empty ? 0 : 4,
    },
    today: { events: empty ? 0 : 13, yesterdaySameTime: empty ? 0 : 11 },
    timeseries: DAILY.map((value, index) => ({
      start: `2026-01-${String(9 + index).padStart(2, '0')}T03:00:00.000Z`,
      label: `${String(9 + index).padStart(2, '0')}/01`,
      events: empty ? 0 : value,
    })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      events: empty ? 0 : [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 8, 9, 8, 7, 6, 7, 9, 11, 10, 7, 4, 2, 1][hour]!,
    })),
    byMarketplace: empty
      ? []
      : [
          { marketplace: 'AMAZON', events: 52 },
          { marketplace: 'MERCADO_LIVRE', events: 35 },
          { marketplace: 'SHOPEE', events: 5 },
          { marketplace: null, events: 2 },
        ],
    byDevice: empty
      ? []
      : [
          { device: 'mobile', events: 61 },
          { device: 'desktop', events: 27 },
          { device: 'tablet', events: 4 },
          { device: 'unknown', events: 2 },
        ],
  };
}

function rankingFixture(dimension: string) {
  const total = 94;
  const rows: Record<string, Array<[string | null, string, string, string | null, number]>> = {
    article: [
      [ARTICLES[0]!.id, 'entity', ARTICLES[0]!.label, null, 48],
      [ARTICLES[1]!.id, 'entity', ARTICLES[1]!.label, null, 29],
      [ARTICLES[2]!.id, 'entity', ARTICLES[2]!.label, null, 15],
      [null, 'no_article', 'Sem artigo (link direto)', null, 2],
    ],
    category: [
      ['53000000-0000-4000-8000-000000000001', 'entity', 'Smartwatches e wearables', null, 77],
      ['53000000-0000-4000-8000-000000000002', 'entity', 'Informática', null, 15],
      [null, 'no_article', 'Sem artigo (link direto)', null, 2],
    ],
    product: [
      [PRODUCTS[0]!.id, 'entity', PRODUCTS[0]!.label, null, 77],
      [PRODUCTS[1]!.id, 'entity', PRODUCTS[1]!.label, null, 17],
    ],
    offer: [
      ['54000000-0000-4000-8000-000000000001', 'entity', 'Amazfit Bip 6', 'Amazon (marketplace atual da oferta)', 45],
      ['54000000-0000-4000-8000-000000000002', 'entity', 'Amazfit Bip 6', 'Mercado Livre (marketplace atual da oferta)', 32],
      ['54000000-0000-4000-8000-000000000003', 'entity', 'Logitech K380', 'Amazon (marketplace atual da oferta)', 9],
      ['54000000-0000-4000-8000-000000000004', 'entity', 'Logitech K380', 'Shopee (marketplace atual da oferta)', 8],
    ],
    marketplace: [
      ['AMAZON', 'entity', 'Amazon', null, 52],
      ['MERCADO_LIVRE', 'entity', 'Mercado Livre', null, 35],
      ['SHOPEE', 'entity', 'Shopee', null, 5],
      [null, 'not_recorded', 'Não registrado', null, 2],
    ],
  };
  return {
    dimension,
    totalEvents: total,
    items: (rows[dimension] ?? []).map(([key, kind, label, secondaryLabel, events]) => ({
      key,
      kind,
      label,
      secondaryLabel,
      events,
      share: events / total,
    })),
  };
}

function eventsFixture(page: number) {
  const marketplaces = ['AMAZON', 'MERCADO_LIVRE', 'AMAZON', 'SHOPEE', null] as const;
  const devices = ['mobile', 'desktop', 'mobile', 'tablet', 'unknown'] as const;
  const items = Array.from({ length: 25 }, (_, index) => {
    const n = (page - 1) * 25 + index;
    const minutes = 30 + n * 37;
    const when = new Date(FIXED_NOW.getTime() - minutes * 60_000);
    const article = n % 9 === 8 ? null : ARTICLES[n % 3]!;
    return {
      id: `55000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
      clickedAt: when.toISOString(),
      article: article ? { id: article.id, title: article.label } : null,
      category: article
        ? { kind: n === 20 ? 'not_recorded' : 'entity', name: n === 20 ? null : n % 3 === 2 ? 'Informática' : 'Smartwatches e wearables' }
        : { kind: 'no_article', name: null },
      product: n % 3 === 2 ? PRODUCTS[1]! : PRODUCTS[0]!,
      offerId: '54000000-0000-4000-8000-000000000001',
      marketplace: n === 20 ? null : marketplaces[n % 4]!,
      outcome: n === 20 ? 'not_recorded' : n === 11 ? 'OFFER_ARCHIVED' : 'REDIRECTED',
      device: devices[n % 5]!,
      botClass: n % 13 === 6 ? 'likely_bot' : n % 5 === 4 ? 'unknown' : 'no_indication',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    };
  }).map((item) => ({
    ...item,
    product: { id: item.product.id, name: item.product.label },
  }));
  return { range: range('7d'), page, pageSize: 25, total: 94, totalPages: 4, items };
}

export interface ClicksMockOptions {
  role?: 'OWNER' | 'EDITOR' | 'VIEWER';
  empty?: boolean;
  summaryError?: boolean;
  /** Registra a URL de cada chamada à API de cliques (para asserts de filtros/asOf). */
  calls?: string[];
}

export async function mockClicksDashboard(page: Page, options: ClicksMockOptions = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  if (options.role && options.role !== 'OWNER') {
    await page.route(`${MOCK_API_ORIGIN}/admin/auth/me`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ME_RESPONSE, sites: ME_RESPONSE.sites.map((site) => ({ ...site, role: options.role })) }),
      });
    });
  } else {
    await mockMe(page);
  }
  await mockEmptyCategoriesAndAuthors(page);
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/clicks/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    options.calls?.push(url.toString());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/summary')) {
      return options.summaryError
        ? json(500, { statusCode: 500, error: 'Internal Server Error', message: 'falha simulada' })
        : json(200, summaryFixture(options.empty));
    }
    if (url.pathname.endsWith('/rankings')) {
      return json(200, options.empty ? { dimension: 'article', totalEvents: 0, items: [] } : rankingFixture(url.searchParams.get('dimension') ?? 'article'));
    }
    if (url.pathname.endsWith('/events')) {
      return json(200, options.empty ? { range: range('7d'), page: 1, pageSize: 25, total: 0, totalPages: 0, items: [] } : eventsFixture(Number(url.searchParams.get('page') ?? '1')));
    }
    if (url.pathname.endsWith('/filter-options')) {
      return json(200, {
        articles: ARTICLES,
        categories: [
          { id: '53000000-0000-4000-8000-000000000002', label: 'Informática' },
          { id: '53000000-0000-4000-8000-000000000001', label: 'Smartwatches e wearables' },
        ],
        products: PRODUCTS,
        offers: [
          { id: '54000000-0000-4000-8000-000000000001', label: 'Amazfit Bip 6 · Amazon' },
          { id: '54000000-0000-4000-8000-000000000002', label: 'Amazfit Bip 6 · Mercado Livre' },
        ],
      });
    }
    if (url.pathname.endsWith('/export.csv')) {
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cliques-2026-01-09-a-2026-01-15.csv"' },
        body: '﻿"data_hora_sao_paulo"\r\n',
      });
    }
    return json(404, { statusCode: 404, error: 'Not Found', message: 'não simulado' });
  });
}

export async function openClicksDashboard(page: Page, search = '') {
  await page.goto(`/${SITE_SLUG}/clicks${search}`);
  await page.getByRole('heading', { level: 1, name: 'Cliques de afiliados' }).waitFor();
}
