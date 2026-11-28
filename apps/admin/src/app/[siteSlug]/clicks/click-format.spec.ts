import { describe, expect, it } from '@jest/globals';
import { apiQuery, describeComparison, filtersFromSearchParams, formatDateTime } from './click-format';

describe('click-format (UXP-006)', () => {
  it('comparação: sem base (anterior 0) nunca vira percentual', () => {
    expect(describeComparison(5, 0)).toEqual({ tone: 'none', text: 'Sem base de comparação (período anterior sem eventos)' });
    expect(describeComparison(0, 0).tone).toBe('flat');
    expect(describeComparison(12, 10)).toMatchObject({ tone: 'up' });
    expect(describeComparison(12, 10).text).toContain('20%');
    expect(describeComparison(5, 10).text).toContain('50% abaixo');
    expect(describeComparison(10, 10).text).toBe('Igual ao período anterior');
  });

  it('filtros da URL: válidos preservados; inválidos voltam ao padrão (7 dias)', () => {
    expect(filtersFromSearchParams(new URLSearchParams('period=30d&marketplace=AMAZON&botClass=likely_bot'))).toMatchObject({
      period: '30d',
      marketplace: 'AMAZON',
      botClass: 'likely_bot',
    });
    expect(filtersFromSearchParams(new URLSearchParams('period=999d'))).toEqual({ period: '7d' });
    expect(filtersFromSearchParams(new URLSearchParams('period=custom&from=2026-01-10&to=2026-01-01'))).toEqual({ period: '7d' });
  });

  it('query da API: mesmos filtros + asOf; datas só no período personalizado', () => {
    const query = new URLSearchParams(apiQuery({ period: '7d', from: '2026-01-01', marketplace: 'SHOPEE' }, '2026-01-15T18:00:00.000Z', { page: 2 }));
    expect(Object.fromEntries(query)).toEqual({ period: '7d', marketplace: 'SHOPEE', asOf: '2026-01-15T18:00:00.000Z', page: '2' });
  });

  it('data e hora sempre no horário de Brasília (independente do fuso do navegador)', () => {
    expect(formatDateTime('2026-01-15T02:30:00.000Z')).toBe('14/01/2026, 23:30:00');
  });
});
