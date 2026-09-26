import { describe, expect, it } from '@jest/globals';
import { resolvePageParam } from './pagination-window';

describe('resolvePageParam', () => {
  it('devolve 1 quando o parâmetro está ausente', () => {
    expect(resolvePageParam(undefined)).toBe(1);
  });

  it('devolve o inteiro quando o parâmetro é um inteiro positivo válido', () => {
    expect(resolvePageParam('1')).toBe(1);
    expect(resolvePageParam('2')).toBe(2);
    expect(resolvePageParam('42')).toBe(42);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], [''], ['01'], ['1e2'], [' 1'], ['1 ']])(
    'devolve null para o valor malformado %p',
    (value) => {
      expect(resolvePageParam(value)).toBeNull();
    },
  );

  it('devolve null quando o parâmetro é repetido (array, múltiplos valores)', () => {
    expect(resolvePageParam(['1', '2'])).toBeNull();
  });
});
