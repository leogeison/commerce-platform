import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  CLICK_EXPORT_MAX_ROWS,
  type ClickEventsQuery,
  type ClickEventsResponse,
  type ClickFilterOptionsResponse,
  type ClickFiltersQuery,
  type ClickRankingsQuery,
  type ClickRankingsResponse,
  type ClickSummaryResponse,
} from '@commerce-platform/contracts';
import {
  PrismaClickAnalyticsQuery,
  type ClickEventRow,
  type ClickFilterValues,
  type ClickWindow,
} from '../../infrastructure/prisma-click-analytics.query';
import { resolveClickRange, timeseriesBuckets, toResolvedRangeContract, type ResolvedClickRange } from './click-period';
import { toCsv } from './click-csv';

/**
 * UXP-006 — casos de uso de leitura do dashboard de cliques. Todas as
 * respostas usam o MESMO resolvedor de período e o MESMO conjunto de
 * filtros (`buildClickWhere`), garantindo consistência entre summary,
 * rankings, eventos e CSV.
 */

const MARKETPLACE_LABELS: Record<string, string> = {
  AMAZON: 'Amazon',
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
  ALIEXPRESS: 'AliExpress',
  MAGALU: 'Magalu',
  HOTMART: 'Hotmart',
  BRAIP: 'Braip',
  KIWIFY: 'Kiwify',
};
const OUTCOME_LABELS = {
  REDIRECTED: 'Redirecionamento autorizado',
  OFFER_ARCHIVED: 'Oferta arquivada (sem redirecionamento)',
  not_recorded: 'Não registrado',
} as const;
const DEVICE_LABELS = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Computador',
  other: 'Outro',
  unknown: 'Desconhecido',
} as const;
const BOT_LABELS = {
  likely_bot: 'Provável bot',
  no_indication: 'Sem indício de bot',
  unknown: 'Desconhecido',
} as const;
const CATEGORY_KIND_LABELS = {
  no_article: 'Sem artigo (link direto)',
  no_category: 'Artigo sem categoria',
  not_recorded: 'Categoria não registrada no clique',
} as const;

function filtersOf(query: ClickFiltersQuery): ClickFilterValues {
  return {
    articleId: query.articleId,
    categoryId: query.categoryId,
    productId: query.productId,
    offerId: query.offerId,
    marketplace: query.marketplace,
    botClass: query.botClass,
    outcome: query.outcome,
  };
}

function marketplaceLabel(value: string | null): string {
  return value ? (MARKETPLACE_LABELS[value] ?? value) : 'Não registrado';
}

function categoryLabel(kind: ClickEventRow['categoryKind'], name: string | null): string {
  if (kind === 'entity') {
    return name ?? 'Categoria removida';
  }
  return CATEGORY_KIND_LABELS[kind];
}

@Injectable()
export class ClickAnalyticsService {
  constructor(private readonly query: PrismaClickAnalyticsQuery) {}

  /** Relógio injetável só para testes. */
  protected now(): Date {
    return new Date();
  }

  private windowFor(siteId: string, range: ResolvedClickRange, filters: ClickFilterValues): ClickWindow {
    return { siteId, start: range.start, end: range.end, filters };
  }

  async summary(siteId: string, input: ClickFiltersQuery): Promise<ClickSummaryResponse> {
    const range = resolveClickRange(input, this.now());
    const filters = filtersOf(input);
    const window = this.windowFor(siteId, range, filters);

    const [totals, previousEvents, todayEvents, yesterdayEvents, series, hours, marketplaces, devices] =
      await Promise.all([
        this.query.totals(window),
        this.query.count({ siteId, start: range.previousStart, end: range.previousEnd, filters }),
        this.query.count({ siteId, start: range.todayStart, end: range.asOf, filters }),
        this.query.count({ siteId, start: range.yesterdayStart, end: range.yesterdaySameTime, filters }),
        this.query.timeseries(window, range.granularity),
        this.query.byHour(window),
        this.query.byMarketplace(window),
        this.query.byDevice(window),
      ]);

    return {
      range: toResolvedRangeContract(range),
      totals: { ...totals, previousEvents },
      today: { events: todayEvents, yesterdaySameTime: yesterdayEvents },
      timeseries: timeseriesBuckets(range).map((bucket) => ({
        start: bucket.start.toISOString(),
        label: bucket.label,
        events: series.get(bucket.key) ?? 0,
      })),
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, events: hours.get(hour) ?? 0 })),
      byMarketplace: marketplaces,
      byDevice: devices,
    };
  }

  async rankings(siteId: string, input: ClickRankingsQuery): Promise<ClickRankingsResponse> {
    const range = resolveClickRange(input, this.now());
    const window = this.windowFor(siteId, range, filtersOf(input));
    const [totalEvents, rows] = await Promise.all([
      this.query.count(window),
      this.query.ranking(window, input.dimension, input.limit),
    ]);
    return {
      dimension: input.dimension,
      totalEvents,
      items: rows.map((row) => {
        let label = row.label ?? '';
        let secondaryLabel = row.secondaryLabel;
        if (input.dimension === 'marketplace') {
          label = marketplaceLabel(row.key);
        } else if (input.dimension === 'category') {
          label = categoryLabel(row.kind, row.label);
        } else if (input.dimension === 'article' && row.kind === 'no_article') {
          label = CATEGORY_KIND_LABELS.no_article;
        } else if (input.dimension === 'offer') {
          secondaryLabel = `${marketplaceLabel(row.secondaryLabel)} (marketplace atual da oferta)`;
        }
        return {
          key: row.key,
          kind: row.kind,
          label,
          secondaryLabel,
          events: row.events,
          share: totalEvents > 0 ? row.events / totalEvents : 0,
        };
      }),
    };
  }

  async events(siteId: string, input: ClickEventsQuery): Promise<ClickEventsResponse> {
    const range = resolveClickRange(input, this.now());
    const window = this.windowFor(siteId, range, filtersOf(input));
    const offset = (input.page - 1) * input.pageSize;
    const [total, rows] = await Promise.all([
      this.query.count(window),
      this.query.events(window, { sort: input.sort, limit: input.pageSize, offset }),
    ]);
    return {
      range: toResolvedRangeContract(range),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
      items: rows.map((row) => ({
        id: row.id,
        clickedAt: row.clickedAt,
        article: row.articleId ? { id: row.articleId, title: row.articleTitle ?? '' } : null,
        category: { kind: row.categoryKind, name: row.categoryKind === 'entity' ? (row.categoryName ?? null) : null },
        product: { id: row.productId, name: row.productName },
        offerId: row.offerId,
        marketplace: row.marketplace,
        outcome: row.outcome,
        device: row.device,
        botClass: row.botClass,
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
      })),
    };
  }

  /** CSV dos eventos filtrados; mais de `CLICK_EXPORT_MAX_ROWS` → 422 (nunca um arquivo truncado). */
  async exportCsv(siteId: string, input: ClickFiltersQuery): Promise<{ filename: string; content: string }> {
    const range = resolveClickRange(input, this.now());
    const window = this.windowFor(siteId, range, filtersOf(input));
    const total = await this.query.count(window);
    if (total > CLICK_EXPORT_MAX_ROWS) {
      throw new UnprocessableEntityException(
        `A exportação permite no máximo ${CLICK_EXPORT_MAX_ROWS.toLocaleString('pt-BR')} eventos (${total.toLocaleString('pt-BR')} no filtro atual). Reduza o período ou aplique filtros.`,
      );
    }
    const rows = await this.query.events(window, { sort: 'clickedAt_desc', limit: CLICK_EXPORT_MAX_ROWS, offset: 0 });
    const header = [
      'data_hora_sao_paulo',
      'artigo',
      'categoria_no_clique',
      'produto',
      'marketplace_no_clique',
      'resultado',
      'dispositivo',
      'classificacao_bot',
      'utm_source',
      'utm_medium',
      'utm_campaign',
    ];
    const content = toCsv(
      header,
      rows.map((row) => [
        row.clickedAtLocal,
        row.articleTitle ?? CATEGORY_KIND_LABELS.no_article,
        categoryLabel(row.categoryKind, row.categoryName),
        row.productName,
        marketplaceLabel(row.marketplace),
        OUTCOME_LABELS[row.outcome],
        DEVICE_LABELS[row.device],
        BOT_LABELS[row.botClass],
        row.utmSource,
        row.utmMedium,
        row.utmCampaign,
      ]),
    );
    return { filename: `cliques-${range.fromDate}-a-${range.toDate}.csv`, content };
  }

  async filterOptions(siteId: string): Promise<ClickFilterOptionsResponse> {
    const options = await this.query.filterOptions(siteId);
    return {
      articles: options.articles,
      categories: options.categories,
      products: options.products,
      offers: options.offers.map((offer) => ({
        id: offer.id,
        label: `${offer.productName} · ${marketplaceLabel(offer.marketplace)}`,
      })),
    };
  }
}
