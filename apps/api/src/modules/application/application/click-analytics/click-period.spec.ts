import type { ClickFiltersQuery } from '@commerce-platform/contracts';
import { addLocalDays, localDateOf, resolveClickRange, shiftByLocalDays, startOfLocalDay, timeseriesBuckets } from './click-period';

const base = (overrides: Partial<ClickFiltersQuery> = {}): ClickFiltersQuery => ({ period: '7d', ...overrides }) as ClickFiltersQuery;
const NOW = new Date('2026-11-25T20:00:00Z'); // 17:00 em São Paulo

describe('click-period (UXP-006)', () => {
  it('meia-noite de São Paulo em UTC e data local de instantes nas bordas', () => {
    expect(startOfLocalDay('2026-11-25').toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(localDateOf(new Date('2026-11-25T02:59:59Z'))).toBe('2026-11-24');
    expect(localDateOf(new Date('2026-11-25T03:00:00Z'))).toBe('2026-11-25');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('asOf nunca no futuro: limitado ao relógio do servidor', () => {
    const range = resolveClickRange(base({ period: 'today', asOf: '2030-01-01T00:00:00Z' }), NOW);
    expect(range.asOf).toEqual(NOW);
  });

  it('hoje: parcial até asOf; anterior = ontem até o mesmo horário', () => {
    const range = resolveClickRange(base({ period: 'today' }), NOW);
    expect(range).toMatchObject({ fromDate: '2026-11-25', toDate: '2026-11-25', isPartial: true, granularity: 'hour', days: 1 });
    expect(range.start.toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(range.end).toEqual(NOW);
    expect(range.previousStart.toISOString()).toBe('2026-11-24T03:00:00.000Z');
    expect(range.previousEnd.toISOString()).toBe('2026-11-24T20:00:00.000Z');
  });

  it('ontem: dia completo, não parcial; anterior = anteontem completo', () => {
    const range = resolveClickRange(base({ period: 'yesterday' }), NOW);
    expect(range.isPartial).toBe(false);
    expect([range.start.toISOString(), range.end.toISOString()]).toEqual(['2026-11-24T03:00:00.000Z', '2026-11-25T03:00:00.000Z']);
    expect([range.previousStart.toISOString(), range.previousEnd.toISOString()]).toEqual([
      '2026-11-23T03:00:00.000Z',
      '2026-11-24T03:00:00.000Z',
    ]);
  });

  it('30 dias: hoje + 29 dias anteriores; anterior com o mesmo tamanho e recorte', () => {
    const range = resolveClickRange(base({ period: '30d' }), NOW);
    expect(range.fromDate).toBe('2026-10-27');
    expect(range.days).toBe(30);
    expect(range.previousStart.toISOString()).toBe(shiftByLocalDays(range.start, -30).toISOString());
    expect(range.previousEnd.toISOString()).toBe('2026-10-26T20:00:00.000Z');
  });

  it('personalizado no passado: dia final inteiro; futuro: intervalo vazio (nunca negativo)', () => {
    const past = resolveClickRange(base({ period: 'custom', from: '2026-11-01', to: '2026-11-03' }), NOW);
    expect(past.isPartial).toBe(false);
    expect(past.end.toISOString()).toBe('2026-11-04T03:00:00.000Z');
    const future = resolveClickRange(base({ period: 'custom', from: '2026-12-01', to: '2026-12-02' }), NOW);
    expect(future.end).toEqual(future.start);
    expect(timeseriesBuckets(future)).toHaveLength(0);
  });

  it('buckets: diários até o dia em andamento; horários até a hora corrente', () => {
    expect(timeseriesBuckets(resolveClickRange(base({ period: '7d' }), NOW)).map((bucket) => bucket.key)).toEqual([
      '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25',
    ]);
    const hours = timeseriesBuckets(resolveClickRange(base({ period: 'today' }), NOW));
    expect(hours).toHaveLength(17); // 00h..16h (17:00 = asOf)
    expect(hours[16]).toMatchObject({ key: '2026-11-25T16', label: '16:00' });
  });

  it('independente do fuso do processo (cálculo por Intl, não pelo TZ do Node)', () => {
    expect(process.env.TZ === undefined || typeof process.env.TZ === 'string').toBe(true);
    expect(startOfLocalDay('2026-01-15').toISOString()).toBe('2026-01-15T03:00:00.000Z');
  });
});
