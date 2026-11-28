import {
  CLICK_ANALYTICS_TIMEZONE,
  type ClickFiltersQuery,
  type ClickResolvedRange,
} from '@commerce-platform/contracts';

/**
 * UXP-006 — resolução de períodos do dashboard de cliques.
 *
 * Regras:
 * - dias de calendário de `America/Sao_Paulo` (fuso de apresentação e de
 *   agrupamento); fronteiras convertidas para instantes UTC;
 * - intervalos SEMIABERTOS `[start, end)` — um evento à meia-noite pertence
 *   a um único dia;
 * - `asOf` é a referência única de "agora" de uma atualização do dashboard
 *   (o cliente envia o mesmo valor para summary, rankings, eventos e CSV);
 *   nunca no futuro (limitado ao relógio do servidor);
 * - o fim de qualquer período é limitado a `asOf` (dia em andamento =
 *   período parcial, `isPartial`);
 * - período anterior: mesmo número de dias de calendário imediatamente
 *   antes, com o MESMO recorte horário quando o período é parcial (ex.:
 *   "hoje até 14:32" × "ontem até 14:32"), para nunca comparar um dia
 *   parcial com um dia inteiro.
 */

const TIMEZONE = CLICK_ANALYTICS_TIMEZONE;
const DAY_MS = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallTimeOf(instant: Date): WallTime {
  const parts = partsFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Diferença (ms) entre o relógio local de São Paulo e o UTC naquele instante. */
function offsetMs(instant: Date): number {
  const wall = wallTimeOf(instant);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Data local (AAAA-MM-DD) de um instante. */
export function localDateOf(instant: Date): string {
  const wall = wallTimeOf(instant);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Instante UTC da meia-noite local de uma data (robusto a mudanças de offset). */
export function startOfLocalDay(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const wallAsUtc = Date.UTC(year, month - 1, day);
  let candidate = wallAsUtc - offsetMs(new Date(wallAsUtc));
  const corrected = wallAsUtc - offsetMs(new Date(candidate));
  if (corrected !== candidate) {
    candidate = corrected;
  }
  return new Date(candidate);
}

/** Mesmo horário local, `days` dias de calendário antes/depois. */
export function shiftByLocalDays(instant: Date, days: number): Date {
  const localDate = localDateOf(instant);
  const timeOfDay = instant.getTime() - startOfLocalDay(localDate).getTime();
  return new Date(startOfLocalDay(addLocalDays(localDate, days)).getTime() + timeOfDay);
}

export function inclusiveDays(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS) + 1;
}

export interface ResolvedClickRange {
  period: ClickFiltersQuery['period'];
  fromDate: string;
  toDate: string;
  days: number;
  start: Date;
  end: Date;
  asOf: Date;
  isPartial: boolean;
  granularity: 'hour' | 'day';
  previousStart: Date;
  previousEnd: Date;
  /** "Hoje até agora" e "ontem até o mesmo horário" (KPI independente do período). */
  todayStart: Date;
  yesterdayStart: Date;
  yesterdaySameTime: Date;
}

const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export function resolveClickRange(query: ClickFiltersQuery, serverNow: Date): ResolvedClickRange {
  const requestedAsOf = query.asOf ? new Date(query.asOf) : serverNow;
  const asOf = requestedAsOf.getTime() > serverNow.getTime() ? serverNow : requestedAsOf;
  const today = localDateOf(asOf);

  let fromDate: string;
  let toDate: string;
  switch (query.period) {
    case 'today':
      fromDate = today;
      toDate = today;
      break;
    case 'yesterday':
      fromDate = addLocalDays(today, -1);
      toDate = fromDate;
      break;
    case 'custom':
      fromDate = query.from!;
      toDate = query.to!;
      break;
    default:
      fromDate = addLocalDays(today, -(PRESET_DAYS[query.period] - 1));
      toDate = today;
  }

  const days = inclusiveDays(fromDate, toDate);
  const start = startOfLocalDay(fromDate);
  const fullEnd = startOfLocalDay(addLocalDays(toDate, 1));
  const cappedEnd = fullEnd.getTime() > asOf.getTime() ? asOf : fullEnd;
  // Período inteiramente no futuro: intervalo vazio, nunca negativo.
  const end = cappedEnd.getTime() < start.getTime() ? start : cappedEnd;

  const todayStart = startOfLocalDay(today);

  return {
    period: query.period,
    fromDate,
    toDate,
    days,
    start,
    end,
    asOf,
    isPartial: end.getTime() < fullEnd.getTime(),
    granularity: days === 1 ? 'hour' : 'day',
    previousStart: shiftByLocalDays(start, -days),
    previousEnd: shiftByLocalDays(end, -days),
    todayStart,
    yesterdayStart: startOfLocalDay(addLocalDays(today, -1)),
    yesterdaySameTime: shiftByLocalDays(asOf, -1),
  };
}

export function toResolvedRangeContract(range: ResolvedClickRange): ClickResolvedRange {
  return {
    period: range.period,
    timezone: TIMEZONE,
    fromDate: range.fromDate,
    toDate: range.toDate,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    asOf: range.asOf.toISOString(),
    isPartial: range.isPartial,
    granularity: range.granularity,
    previous: { start: range.previousStart.toISOString(), end: range.previousEnd.toISOString() },
  };
}

/**
 * Buckets da série temporal (para preencher com zero os intervalos sem
 * eventos). Chave = texto produzido pelo SQL para o bucket local.
 */
export function timeseriesBuckets(range: ResolvedClickRange): Array<{ key: string; start: Date; label: string }> {
  const buckets: Array<{ key: string; start: Date; label: string }> = [];
  if (range.granularity === 'hour') {
    const dayStart = startOfLocalDay(range.fromDate);
    for (let hour = 0; hour < 24; hour += 1) {
      const start = new Date(dayStart.getTime() + hour * 3_600_000);
      if (start.getTime() >= range.end.getTime()) {
        break;
      }
      const hh = String(hour).padStart(2, '0');
      buckets.push({ key: `${range.fromDate}T${hh}`, start, label: `${hh}:00` });
    }
    return buckets;
  }
  for (let offset = 0; offset < range.days; offset += 1) {
    const localDate = addLocalDays(range.fromDate, offset);
    const start = startOfLocalDay(localDate);
    if (start.getTime() >= range.end.getTime()) {
      break;
    }
    buckets.push({ key: localDate, start, label: `${localDate.slice(8, 10)}/${localDate.slice(5, 7)}` });
  }
  return buckets;
}
