import { z } from 'zod';
import { marketplaceSchema } from '../../common/marketplace.js';

/**
 * UXP-006 — contratos do dashboard de cliques de afiliados (Admin).
 *
 * Semântica (ver Architecture.md, "Dashboard de cliques"):
 * - "evento" = requisição aceita e registrada pelo redirecionador
 *   (`AffiliateClick`). Não é visitante único, venda nem conversão.
 * - "redirecionamento autorizado" = evento com `outcome = REDIRECTED`
 *   (a API respondeu 302 para a `affiliateUrl`); não confirma chegada ao
 *   marketplace. `OFFER_ARCHIVED` = 410. `not_recorded` = evento anterior à
 *   gravação do resultado (UXP-006), nunca preenchido retroativamente.
 * - períodos em dias de calendário de `America/Sao_Paulo`, intervalos
 *   semiabertos `[início, fim)` em UTC; `asOf` é a referência única de
 *   "agora" compartilhada por todas as consultas de uma atualização.
 */

export const CLICK_ANALYTICS_TIMEZONE = 'America/Sao_Paulo';
export const CLICK_CUSTOM_PERIOD_MAX_DAYS = 366;
export const CLICK_EVENTS_MAX_PAGE_SIZE = 100;
export const CLICK_EXPORT_MAX_ROWS = 10_000;
export const CLICK_RANKING_MAX_LIMIT = 50;

export const clickPeriodSchema = z.enum(['today', 'yesterday', '7d', '30d', '90d', 'custom']);
export type ClickPeriod = z.infer<typeof clickPeriodSchema>;

/** Classificação derivada do User-Agent — nunca "humano confirmado". */
export const clickBotClassSchema = z.enum(['likely_bot', 'no_indication', 'unknown']);
export type ClickBotClass = z.infer<typeof clickBotClassSchema>;

export const clickDeviceSchema = z.enum(['mobile', 'tablet', 'desktop', 'other', 'unknown']);
export type ClickDevice = z.infer<typeof clickDeviceSchema>;

export const clickOutcomeSchema = z.enum(['REDIRECTED', 'OFFER_ARCHIVED', 'not_recorded']);
export type ClickOutcome = z.infer<typeof clickOutcomeSchema>;

export const clickDimensionSchema = z.enum(['article', 'category', 'product', 'offer', 'marketplace']);
export type ClickDimension = z.infer<typeof clickDimensionSchema>;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.');

function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Filtros comuns a summary, rankings, eventos e CSV (mesma semântica em todos). */
export const clickFiltersQuerySchema = z
  .object({
    period: clickPeriodSchema.default('7d'),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    asOf: z.string().datetime({ offset: true }).optional(),
    articleId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    offerId: z.string().uuid().optional(),
    marketplace: marketplaceSchema.optional(),
    botClass: clickBotClassSchema.optional(),
    outcome: clickOutcomeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period !== 'custom') {
      return;
    }
    if (!value.from || !value.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Período personalizado exige início e fim.' });
      return;
    }
    if (Number.isNaN(Date.parse(`${value.from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${value.to}T00:00:00Z`))) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Data inválida.' });
      return;
    }
    const days = daysBetweenInclusive(value.from, value.to);
    if (days < 1) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'O fim do período deve ser igual ou posterior ao início.' });
    } else if (days > CLICK_CUSTOM_PERIOD_MAX_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `O período personalizado pode ter no máximo ${CLICK_CUSTOM_PERIOD_MAX_DAYS} dias.`,
      });
    }
  });
export type ClickFiltersQuery = z.infer<typeof clickFiltersQuerySchema>;

export const clickRankingsQuerySchema = clickFiltersQuerySchema.and(
  z.object({
    dimension: clickDimensionSchema,
    limit: z.coerce.number().int().positive().max(CLICK_RANKING_MAX_LIMIT).default(10),
  }),
);
export type ClickRankingsQuery = z.infer<typeof clickRankingsQuerySchema>;

export const clickEventsQuerySchema = clickFiltersQuerySchema.and(
  z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(CLICK_EVENTS_MAX_PAGE_SIZE).default(25),
    sort: z.enum(['clickedAt_desc', 'clickedAt_asc']).default('clickedAt_desc'),
  }),
);
export type ClickEventsQuery = z.infer<typeof clickEventsQuerySchema>;

export const clickResolvedRangeSchema = z.object({
  period: clickPeriodSchema,
  timezone: z.literal(CLICK_ANALYTICS_TIMEZONE),
  /** Datas locais (inclusivas) exibidas ao usuário. */
  fromDate: localDateSchema,
  toDate: localDateSchema,
  /** Intervalo efetivamente consultado, semiaberto, em UTC (fim limitado a `asOf`). */
  start: z.string().datetime(),
  end: z.string().datetime(),
  asOf: z.string().datetime(),
  /** O período inclui o dia em andamento (fim limitado a `asOf`). */
  isPartial: z.boolean(),
  granularity: z.enum(['hour', 'day']),
  previous: z.object({ start: z.string().datetime(), end: z.string().datetime() }),
});
export type ClickResolvedRange = z.infer<typeof clickResolvedRangeSchema>;

const countSchema = z.number().int().nonnegative();

export const clickSummaryResponseSchema = z.object({
  range: clickResolvedRangeSchema,
  totals: z.object({
    events: countSchema,
    previousEvents: countSchema,
    redirected: countSchema,
    offerArchived: countSchema,
    outcomeNotRecorded: countSchema,
    likelyBot: countSchema,
    noBotIndication: countSchema,
    botUnknown: countSchema,
    articlesWithClicks: countSchema,
    productsWithClicks: countSchema,
    offersWithClicks: countSchema,
  }),
  /** Hoje (até `asOf`) × ontem até o mesmo horário — independe do período, respeita os demais filtros. */
  today: z.object({ events: countSchema, yesterdaySameTime: countSchema }),
  /** Série temporal com buckets sem eventos preenchidos com zero. */
  timeseries: z.array(z.object({ start: z.string().datetime(), label: z.string(), events: countSchema })),
  byHour: z.array(z.object({ hour: z.number().int().min(0).max(23), events: countSchema })),
  byMarketplace: z.array(z.object({ marketplace: marketplaceSchema.nullable(), events: countSchema })),
  byDevice: z.array(z.object({ device: clickDeviceSchema, events: countSchema })),
});
export type ClickSummaryResponse = z.infer<typeof clickSummaryResponseSchema>;

/** `key` null + `kind` explicam buckets sem entidade (nunca inventados). */
export const clickRankingItemSchema = z.object({
  key: z.string().nullable(),
  kind: z.enum(['entity', 'no_article', 'no_category', 'not_recorded']),
  label: z.string(),
  secondaryLabel: z.string().nullable(),
  events: countSchema,
  share: z.number().min(0).max(1),
});
export type ClickRankingItem = z.infer<typeof clickRankingItemSchema>;

export const clickRankingsResponseSchema = z.object({
  dimension: clickDimensionSchema,
  totalEvents: countSchema,
  items: z.array(clickRankingItemSchema),
});
export type ClickRankingsResponse = z.infer<typeof clickRankingsResponseSchema>;

export const clickEventSchema = z.object({
  id: z.string().uuid(),
  clickedAt: z.string().datetime(),
  article: z.object({ id: z.string().uuid(), title: z.string() }).nullable(),
  /** Categoria do Artigo NO MOMENTO do clique (nome atual da categoria). */
  category: z.object({ kind: clickRankingItemSchema.shape.kind, name: z.string().nullable() }),
  product: z.object({ id: z.string().uuid(), name: z.string() }),
  offerId: z.string().uuid(),
  /** Marketplace NO MOMENTO do clique; null = não registrado. */
  marketplace: marketplaceSchema.nullable(),
  outcome: clickOutcomeSchema,
  device: clickDeviceSchema,
  botClass: clickBotClassSchema,
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
});
export type ClickEvent = z.infer<typeof clickEventSchema>;

export const clickEventsResponseSchema = z.object({
  range: clickResolvedRangeSchema,
  items: z.array(clickEventSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: countSchema,
  totalPages: countSchema,
});
export type ClickEventsResponse = z.infer<typeof clickEventsResponseSchema>;

/** Opções dos filtros: só entidades do Site com ao menos um clique registrado. */
export const clickFilterOptionsResponseSchema = z.object({
  articles: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  categories: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  products: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  offers: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
});
export type ClickFilterOptionsResponse = z.infer<typeof clickFilterOptionsResponseSchema>;

export const clicksSiteParamsSchema = z.object({
  siteSlug: z.string().min(1),
});
export type ClicksSiteParams = z.infer<typeof clicksSiteParamsSchema>;
