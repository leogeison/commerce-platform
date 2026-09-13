import { describe, expect, it } from '@jest/globals';
import type { PublicArticleProduct } from '@commerce-platform/contracts';
import { resolveProductBlock } from './product-block-resolver';

function buildProduct(overrides: Partial<PublicArticleProduct> = {}): PublicArticleProduct {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Produto padrão de teste',
    description: null,
    imageUrl: null,
    position: 0,
    offers: [],
    ...overrides,
  };
}

describe('resolveProductBlock', () => {
  it('retorna found com o Product cujo id casa com productId', () => {
    const target = buildProduct({ id: '22222222-2222-2222-2222-222222222222', name: 'Produto alvo' });
    const products = [buildProduct(), target];

    const result = resolveProductBlock(products, '22222222-2222-2222-2222-222222222222');

    expect(result).toEqual({ status: 'found', product: target });
  });

  it('retorna not-found quando productId não existe em nenhum Product do array', () => {
    const products = [buildProduct({ id: '33333333-3333-3333-3333-333333333333' })];

    const result = resolveProductBlock(products, '44444444-4444-4444-4444-444444444444');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('retorna not-found quando products é um array vazio', () => {
    const result = resolveProductBlock([], '11111111-1111-1111-1111-111111111111');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('com múltiplos Products, resolve exatamente o correspondente (nunca o primeiro/último por posição)', () => {
    const first = buildProduct({ id: '55555555-5555-5555-5555-555555555555', name: 'Primeiro' });
    const middle = buildProduct({ id: '66666666-6666-6666-6666-666666666666', name: 'Do meio' });
    const last = buildProduct({ id: '77777777-7777-7777-7777-777777777777', name: 'Último' });
    const products = [first, middle, last];

    expect(resolveProductBlock(products, middle.id)).toEqual({ status: 'found', product: middle });
    expect(resolveProductBlock(products, first.id)).toEqual({ status: 'found', product: first });
    expect(resolveProductBlock(products, last.id)).toEqual({ status: 'found', product: last });
  });
});
