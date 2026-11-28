import { Injectable } from '@nestjs/common';
import type {
  ClickBotClass,
  ClickDevice,
  ClickDimension,
  ClickFiltersQuery,
  ClickOutcome,
  ClickRankingItem,
} from '@commerce-platform/contracts';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Prisma, type Marketplace } from '../../../generated/prisma/client';

/**
 * UXP-006 — consultas de leitura do dashboard de cliques (read model
 * transversal: AffiliateClick × Offer × Product × Article × Category).
 * Vive em `application/` porque cruza domínios — `tracking` só grava e não
 * conhece Catálogo/Editorial.
 *
 * Garantias:
 * - tenancy: TODA consulta filtra `c."siteId"` e TODA junção casa também
 *   `siteId` (chaves compostas do schema) — nada de outro Site entra;
 * - SQL só via `Prisma.sql` com valores parametrizados;
 * - agregações (`count`, `GROUP BY`) executadas no PostgreSQL; nenhuma
 *   consulta carrega eventos em memória além da página pedida (ou do
 *   limite do CSV);
 * - `clickedAt` é `timestamp` sem fuso gravado em UTC: comparado com
 *   literais `(<iso>::timestamptz AT TIME ZONE 'UTC')` e convertido para o
 *   relógio de São Paulo com `("clickedAt" AT TIME ZONE 'UTC') AT TIME ZONE
 *   'America/Sao_Paulo'` — independente do `TimeZone` da sessão;
 * - datas devolvidas como TEXTO ISO-8601 UTC (nunca `Date` do driver, que
 *   interpretaria `timestamp` sem fuso no fuso do processo Node).
 */

/** Padrões de User-Agent de automação conhecidos (classificação, não certeza). */
export const LIKELY_BOT_PATTERN =
  '(bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|curl|wget|python|httpclient|http-client|okhttp|axios|node-fetch|undici|go-http|java/|libwww|headless|phantom|lighthouse|pagespeed|monitor|uptime|pingdom|scan)';
const MOBILE_PATTERN = '(mobi|iphone|ipod|windows phone|android.*mobile)';
const TABLET_PATTERN = '(ipad|tablet|kindle|silk|playbook|android)';
const DESKTOP_PATTERN = '(windows nt|macintosh|mac os x|x11|cros|linux)';

const LOCAL_TIME = Prisma.sql`(c."clickedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`;
const BOT_CLASS = Prisma.sql`(CASE WHEN c."userAgent" IS NULL OR btrim(c."userAgent") = '' THEN 'unknown' WHEN c."userAgent" ~* ${LIKELY_BOT_PATTERN} THEN 'likely_bot' ELSE 'no_indication' END)`;
const DEVICE = Prisma.sql`(CASE WHEN c."userAgent" IS NULL OR btrim(c."userAgent") = '' THEN 'unknown' WHEN c."userAgent" ~* ${MOBILE_PATTERN} THEN 'mobile' WHEN c."userAgent" ~* ${TABLET_PATTERN} THEN 'tablet' WHEN c."userAgent" ~* ${DESKTOP_PATTERN} THEN 'desktop' ELSE 'other' END)`;
const OUTCOME = Prisma.sql`COALESCE(c."outcome"::text, 'not_recorded')`;
/**
 * Categoria do Artigo no momento do clique. Ordem das regras: sem Artigo é
 * fato conhecido mesmo em eventos antigos; `outcome IS NULL` marca eventos
 * anteriores à gravação do estado do clique (categoria não registrada).
 */
const CATEGORY_KIND = Prisma.sql`(CASE WHEN c."articleId" IS NULL THEN 'no_article' WHEN c."outcome" IS NULL THEN 'not_recorded' WHEN c."articleCategoryId" IS NULL THEN 'no_category' ELSE 'entity' END)`;
const FROM_CLICKS = Prisma.sql`FROM "AffiliateClick" c
  JOIN "Offer" o ON o."id" = c."offerId" AND o."siteId" = c."siteId"
  LEFT JOIN "Article" a ON a."id" = c."articleId" AND a."siteId" = c."siteId"`;

function utc(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

export type ClickFilterValues = Pick<
  ClickFiltersQuery,
  'articleId' | 'categoryId' | 'productId' | 'offerId' | 'marketplace' | 'botClass' | 'outcome'
>;

export interface ClickWindow {
  siteId: string;
  start: Date;
  end: Date;
  filters: ClickFilterValues;
}

/** WHERE único e compartilhado por summary, rankings, eventos e CSV. */
export function buildClickWhere(window: ClickWindow): Prisma.Sql {
  const { filters } = window;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c."siteId" = ${window.siteId}`,
    Prisma.sql`c."clickedAt" >= ${utc(window.start)}`,
    Prisma.sql`c."clickedAt" < ${utc(window.end)}`,
  ];
  if (filters.articleId) {conditions.push(Prisma.sql`c."articleId" = ${filters.articleId}`);}
  if (filters.categoryId) {conditions.push(Prisma.sql`c."articleCategoryId" = ${filters.categoryId}`);}
  if (filters.productId) {conditions.push(Prisma.sql`o."productId" = ${filters.productId}`);}
  if (filters.offerId) {conditions.push(Prisma.sql`c."offerId" = ${filters.offerId}`);}
  if (filters.marketplace) {conditions.push(Prisma.sql`c."marketplace" = ${filters.marketplace}::"Marketplace"`);}
  if (filters.botClass) {conditions.push(Prisma.sql`${BOT_CLASS} = ${filters.botClass}`);}
  if (filters.outcome === 'not_recorded') {
    conditions.push(Prisma.sql`c."outcome" IS NULL`);
  } else if (filters.outcome) {
    conditions.push(Prisma.sql`c."outcome" = ${filters.outcome}::"AffiliateClickOutcome"`);
  }
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

const toCount = (value: bigint | number | null | undefined): number => Number(value ?? 0);

export interface ClickTotalsRow {
  events: number;
  redirected: number;
  offerArchived: number;
  outcomeNotRecorded: number;
  likelyBot: number;
  noBotIndication: number;
  botUnknown: number;
  articlesWithClicks: number;
  productsWithClicks: number;
  offersWithClicks: number;
}

export interface ClickEventRow {
  id: string;
  clickedAt: string;
  clickedAtLocal: string;
  articleId: string | null;
  articleTitle: string | null;
  categoryKind: ClickRankingItem['kind'];
  categoryName: string | null;
  productId: string;
  productName: string;
  offerId: string;
  marketplace: Marketplace | null;
  outcome: ClickOutcome;
  device: ClickDevice;
  botClass: ClickBotClass;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface ClickRankingRow {
  key: string | null;
  kind: ClickRankingItem['kind'];
  label: string | null;
  secondaryLabel: string | null;
  events: number;
}

@Injectable()
export class PrismaClickAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Totais do período. Medição (EXPLAIN ANALYZE, 100 mil eventos sintéticos,
   * janela de 90 dias): três `count(DISTINCT …)` numa única consulta
   * ordenavam em disco (~606 ms); separadas em contagens com `FILTER`
   * (~54 ms) + distintos por `GROUP BY` sobre um CTE materializado
   * (agregação por hash em memória, ~116 ms). Sem índice novo.
   */
  async totals(window: ClickWindow): Promise<ClickTotalsRow> {
    const where = buildClickWhere(window);
    const [countsRows, distinctRows] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, bigint>>>(Prisma.sql`
        SELECT
          count(*) AS "events",
          count(*) FILTER (WHERE c."outcome" = 'REDIRECTED') AS "redirected",
          count(*) FILTER (WHERE c."outcome" = 'OFFER_ARCHIVED') AS "offerArchived",
          count(*) FILTER (WHERE c."outcome" IS NULL) AS "outcomeNotRecorded",
          count(*) FILTER (WHERE ${BOT_CLASS} = 'likely_bot') AS "likelyBot",
          count(*) FILTER (WHERE ${BOT_CLASS} = 'no_indication') AS "noBotIndication",
          count(*) FILTER (WHERE ${BOT_CLASS} = 'unknown') AS "botUnknown"
        ${FROM_CLICKS} ${where}`),
      this.prisma.$queryRaw<Array<Record<string, bigint>>>(Prisma.sql`
        WITH f AS MATERIALIZED (
          SELECT c."articleId" AS "articleId", o."productId" AS "productId", c."offerId" AS "offerId"
          ${FROM_CLICKS} ${where}
        )
        SELECT
          (SELECT count(*) FROM (SELECT "articleId" FROM f WHERE "articleId" IS NOT NULL GROUP BY 1) x) AS "articlesWithClicks",
          (SELECT count(*) FROM (SELECT "productId" FROM f GROUP BY 1) y) AS "productsWithClicks",
          (SELECT count(*) FROM (SELECT "offerId" FROM f GROUP BY 1) z) AS "offersWithClicks"`),
    ]);
    const merged = { ...(countsRows[0] ?? {}), ...(distinctRows[0] ?? {}) };
    return Object.fromEntries(
      Object.entries(merged).map(([key, value]) => [key, toCount(value)]),
    ) as unknown as ClickTotalsRow;
  }

  async count(window: ClickWindow): Promise<number> {
    const [row] = await this.prisma.$queryRaw<Array<{ events: bigint }>>(Prisma.sql`
      SELECT count(*) AS "events" ${FROM_CLICKS} ${buildClickWhere(window)}`);
    return toCount(row?.events);
  }

  /** Contagem por bucket local (dia ou hora); buckets vazios são preenchidos por quem chama. */
  async timeseries(window: ClickWindow, granularity: 'hour' | 'day'): Promise<Map<string, number>> {
    const bucket =
      granularity === 'hour'
        ? Prisma.sql`to_char(date_trunc('hour', ${LOCAL_TIME}), 'YYYY-MM-DD"T"HH24')`
        : Prisma.sql`to_char(date_trunc('day', ${LOCAL_TIME}), 'YYYY-MM-DD')`;
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; events: bigint }>>(Prisma.sql`
      SELECT ${bucket} AS "bucket", count(*) AS "events"
      ${FROM_CLICKS} ${buildClickWhere(window)}
      GROUP BY 1`);
    return new Map(rows.map((row) => [row.bucket, toCount(row.events)]));
  }

  async byHour(window: ClickWindow): Promise<Map<number, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; events: bigint }>>(Prisma.sql`
      SELECT extract(hour FROM ${LOCAL_TIME})::int AS "hour", count(*) AS "events"
      ${FROM_CLICKS} ${buildClickWhere(window)}
      GROUP BY 1`);
    return new Map(rows.map((row) => [Number(row.hour), toCount(row.events)]));
  }

  async byMarketplace(window: ClickWindow): Promise<Array<{ marketplace: Marketplace | null; events: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ marketplace: Marketplace | null; events: bigint }>>(Prisma.sql`
      SELECT c."marketplace"::text AS "marketplace", count(*) AS "events"
      ${FROM_CLICKS} ${buildClickWhere(window)}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC NULLS LAST`);
    return rows.map((row) => ({ marketplace: row.marketplace, events: toCount(row.events) }));
  }

  async byDevice(window: ClickWindow): Promise<Array<{ device: ClickDevice; events: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ device: ClickDevice; events: bigint }>>(Prisma.sql`
      SELECT ${DEVICE} AS "device", count(*) AS "events"
      ${FROM_CLICKS} ${buildClickWhere(window)}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC`);
    return rows.map((row) => ({ device: row.device, events: toCount(row.events) }));
  }

  /**
   * Ranking com ordenação determinística: eventos desc, tipo do bucket
   * (`entity` < `no_article` < `no_category` < `not_recorded`), rótulo asc,
   * chave asc — buckets especiais têm rótulo e chave nulos, então o tipo é
   * o que desempata entre eles.
   */
  async ranking(window: ClickWindow, dimension: ClickDimension, limit: number): Promise<ClickRankingRow[]> {
    const where = buildClickWhere(window);
    let query: Prisma.Sql;
    switch (dimension) {
      case 'article':
        query = Prisma.sql`
          SELECT c."articleId" AS "key",
                 CASE WHEN c."articleId" IS NULL THEN 'no_article' ELSE 'entity' END AS "kind",
                 a."title" AS "label", NULL::text AS "secondaryLabel", count(*) AS "events"
          ${FROM_CLICKS} ${where}
          GROUP BY c."articleId", a."title"`;
        break;
      case 'category':
        query = Prisma.sql`
          SELECT CASE WHEN ${CATEGORY_KIND} = 'entity' THEN c."articleCategoryId" END AS "key",
                 ${CATEGORY_KIND} AS "kind",
                 max(cat."name") AS "label", NULL::text AS "secondaryLabel", count(*) AS "events"
          ${FROM_CLICKS}
          LEFT JOIN "Category" cat ON cat."id" = c."articleCategoryId" AND cat."siteId" = c."siteId"
          ${where}
          GROUP BY 1, 2`;
        break;
      // Produto/Oferta: agrega primeiro pelo identificador e só depois junta
      // os nomes (medição: ~400 ms → ver Post-Publication-Backlog, UXP-006).
      case 'product':
        query = Prisma.sql`
          SELECT g."key" AS "key", 'entity' AS "kind", p2."name" AS "label",
                 NULL::text AS "secondaryLabel", g."events" AS "events"
          FROM (SELECT o."productId" AS "key", count(*) AS "events" ${FROM_CLICKS} ${where} GROUP BY 1) g
          JOIN "Product" p2 ON p2."id" = g."key" AND p2."siteId" = ${window.siteId}`;
        break;
      case 'offer':
        query = Prisma.sql`
          SELECT g."key" AS "key", 'entity' AS "kind", p2."name" AS "label",
                 o2."marketplace"::text AS "secondaryLabel", g."events" AS "events"
          FROM (SELECT c."offerId" AS "key", count(*) AS "events" ${FROM_CLICKS} ${where} GROUP BY 1) g
          JOIN "Offer" o2 ON o2."id" = g."key" AND o2."siteId" = ${window.siteId}
          JOIN "Product" p2 ON p2."id" = o2."productId" AND p2."siteId" = ${window.siteId}`;
        break;
      case 'marketplace':
        query = Prisma.sql`
          SELECT c."marketplace"::text AS "key",
                 CASE WHEN c."marketplace" IS NULL THEN 'not_recorded' ELSE 'entity' END AS "kind",
                 c."marketplace"::text AS "label", NULL::text AS "secondaryLabel", count(*) AS "events"
          ${FROM_CLICKS} ${where}
          GROUP BY c."marketplace"`;
        break;
    }
    const rows = await this.prisma.$queryRaw<Array<Omit<ClickRankingRow, 'events'> & { events: bigint }>>(Prisma.sql`
      SELECT * FROM (${query}) ranked
      ORDER BY "events" DESC, "kind" ASC, "label" ASC NULLS LAST, "key" ASC NULLS LAST
      LIMIT ${limit}`);
    return rows.map((row) => ({ ...row, events: toCount(row.events) }));
  }

  /** Eventos individuais, ordenação determinística (`clickedAt`, `id`). */
  async events(
    window: ClickWindow,
    options: { sort: 'clickedAt_desc' | 'clickedAt_asc'; limit: number; offset: number },
  ): Promise<ClickEventRow[]> {
    const order =
      options.sort === 'clickedAt_asc'
        ? Prisma.sql`ORDER BY c."clickedAt" ASC, c."id" ASC`
        : Prisma.sql`ORDER BY c."clickedAt" DESC, c."id" DESC`;
    return this.prisma.$queryRaw<ClickEventRow[]>(Prisma.sql`
      SELECT c."id" AS "id",
             to_char(c."clickedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "clickedAt",
             to_char(${LOCAL_TIME}, 'YYYY-MM-DD HH24:MI:SS') AS "clickedAtLocal",
             c."articleId" AS "articleId", a."title" AS "articleTitle",
             ${CATEGORY_KIND} AS "categoryKind", cat."name" AS "categoryName",
             o."productId" AS "productId", p."name" AS "productName",
             c."offerId" AS "offerId", c."marketplace"::text AS "marketplace",
             ${OUTCOME} AS "outcome", ${DEVICE} AS "device", ${BOT_CLASS} AS "botClass",
             c."utmSource" AS "utmSource", c."utmMedium" AS "utmMedium", c."utmCampaign" AS "utmCampaign"
      ${FROM_CLICKS}
      JOIN "Product" p ON p."id" = o."productId" AND p."siteId" = c."siteId"
      LEFT JOIN "Category" cat ON cat."id" = c."articleCategoryId" AND cat."siteId" = c."siteId"
      ${buildClickWhere(window)}
      ${order}
      LIMIT ${options.limit} OFFSET ${options.offset}`);
  }

  /** Entidades do Site com ao menos um clique registrado (opções dos filtros). */
  async filterOptions(siteId: string) {
    const [articles, categories, products, offers] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; label: string }>>(Prisma.sql`
        SELECT DISTINCT a."id" AS "id", a."title" AS "label"
        FROM "AffiliateClick" c JOIN "Article" a ON a."id" = c."articleId" AND a."siteId" = c."siteId"
        WHERE c."siteId" = ${siteId} ORDER BY 2, 1`),
      this.prisma.$queryRaw<Array<{ id: string; label: string }>>(Prisma.sql`
        SELECT DISTINCT cat."id" AS "id", cat."name" AS "label"
        FROM "AffiliateClick" c JOIN "Category" cat ON cat."id" = c."articleCategoryId" AND cat."siteId" = c."siteId"
        WHERE c."siteId" = ${siteId} ORDER BY 2, 1`),
      this.prisma.$queryRaw<Array<{ id: string; label: string }>>(Prisma.sql`
        SELECT DISTINCT p."id" AS "id", p."name" AS "label"
        FROM "AffiliateClick" c
        JOIN "Offer" o ON o."id" = c."offerId" AND o."siteId" = c."siteId"
        JOIN "Product" p ON p."id" = o."productId" AND p."siteId" = c."siteId"
        WHERE c."siteId" = ${siteId} ORDER BY 2, 1`),
      this.prisma.$queryRaw<Array<{ id: string; productName: string; marketplace: Marketplace }>>(Prisma.sql`
        SELECT DISTINCT o."id" AS "id", p."name" AS "productName", o."marketplace"::text AS "marketplace"
        FROM "AffiliateClick" c
        JOIN "Offer" o ON o."id" = c."offerId" AND o."siteId" = c."siteId"
        JOIN "Product" p ON p."id" = o."productId" AND p."siteId" = c."siteId"
        WHERE c."siteId" = ${siteId} ORDER BY 2, 3, 1`),
    ]);
    return { articles, categories, products, offers };
  }
}
