import {
  CLICK_ANALYTICS_TIMEZONE,
  clickFiltersQuerySchema,
  type ClickBotClass,
  type ClickDevice,
  type ClickDimension,
  type ClickFiltersQuery,
  type ClickOutcome,
  type Marketplace,
} from '@commerce-platform/contracts';

/**
 * UXP-006 — rótulos, formatação e estado de URL do dashboard de cliques.
 * Funções puras (testadas em `click-format.spec.ts`). Local a `clicks/`:
 * conhece "Oferta"/"marketplace" (nunca `packages/ui`).
 */

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  AMAZON: 'Amazon',
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
  ALIEXPRESS: 'AliExpress',
  MAGALU: 'Magalu',
  HOTMART: 'Hotmart',
  BRAIP: 'Braip',
  KIWIFY: 'Kiwify',
};

export const OUTCOME_LABELS: Record<ClickOutcome, string> = {
  REDIRECTED: 'Redirecionamento autorizado',
  OFFER_ARCHIVED: 'Oferta arquivada (sem redirecionamento)',
  not_recorded: 'Não registrado',
};

export const DEVICE_LABELS: Record<ClickDevice, string> = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Computador',
  other: 'Outro',
  unknown: 'Desconhecido',
};

/** Nunca "humano": ausência de indício não confirma pessoa real. */
export const BOT_LABELS: Record<ClickBotClass, string> = {
  likely_bot: 'Provável bot',
  no_indication: 'Sem indício de bot',
  unknown: 'Desconhecido',
};

export const DIMENSION_LABELS: Record<ClickDimension, string> = {
  article: 'Artigos',
  category: 'Categorias',
  product: 'Produtos',
  offer: 'Ofertas',
  marketplace: 'Marketplaces',
};

export const PERIOD_OPTIONS: Array<{ value: ClickFiltersQuery['period']; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export function marketplaceLabel(value: Marketplace | null): string {
  return value ? MARKETPLACE_LABELS[value] : 'Não registrado';
}

const numberFormat = new Intl.NumberFormat('pt-BR');
export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function formatShare(share: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(share);
}

/**
 * Comparação com o período anterior. Sem base (anterior = 0) nunca vira
 * percentual — "+∞%" ou "+100%" seriam enganosos.
 */
export function describeComparison(current: number, previous: number): { tone: 'up' | 'down' | 'flat' | 'none'; text: string } {
  if (previous === 0) {
    return current === 0
      ? { tone: 'flat', text: 'Sem eventos também no período anterior' }
      : { tone: 'none', text: 'Sem base de comparação (período anterior sem eventos)' };
  }
  const change = (current - previous) / previous;
  if (change === 0) {
    return { tone: 'flat', text: 'Igual ao período anterior' };
  }
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(change));
  return change > 0
    ? { tone: 'up', text: `${formatted} acima do período anterior (${formatCount(previous)})` }
    : { tone: 'down', text: `${formatted} abaixo do período anterior (${formatCount(previous)})` };
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: CLICK_ANALYTICS_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: CLICK_ANALYTICS_TIMEZONE, hour: '2-digit', minute: '2-digit' });

/** Data e hora no fuso de apresentação (Brasília), independente do navegador. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Chaves de filtro persistidas na URL (mesmo vocabulário da API). */
export const FILTER_KEYS = [
  'period',
  'from',
  'to',
  'articleId',
  'categoryId',
  'productId',
  'offerId',
  'marketplace',
  'botClass',
  'outcome',
] as const;

/** Lê os filtros da URL; valores inválidos voltam ao padrão (7 dias, sem filtros). */
export function filtersFromSearchParams(params: URLSearchParams): ClickFiltersQuery {
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) {
      raw[key] = value;
    }
  }
  const parsed = clickFiltersQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : clickFiltersQuerySchema.parse({});
}

/** Query string da API: filtros + `asOf` (referência única de "agora" da atualização). */
export function apiQuery(filters: ClickFiltersQuery, asOf: string, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') {
      if ((key === 'from' || key === 'to') && filters.period !== 'custom') {
        continue;
      }
      params.set(key, String(value));
    }
  }
  params.set('asOf', asOf);
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }
  return params.toString();
}
