/**
 * spikes/lexical-editorial/product-block-component.mjs
 *
 * UXE-004 — Round-trip 2.
 *
 * Componente de renderização usado apenas pelo runner deste spike
 * (`product-block-round-trip-full-cycle.mjs`), nunca por `apps/fastcompre`.
 * Recebe SOMENTE `productId` (o que atravessou a sintaxe/AST) e uma função
 * `resolveProduct` injetada por quem monta a árvore de componentes — nunca
 * importa nem chama diretamente nenhuma fonte de dados própria.
 *
 * Essa injeção é o mecanismo que prova, por construção, a decisão 3 da
 * consolidação da UXE-004: como `resolveProduct` é sempre a projeção
 * estrutural real de UM artigo específico (nunca uma tabela global de
 * Produto), um `productId` válido mas fora dessa projeção — mesmo que
 * exista de verdade em outro Artigo — só pode resultar em
 * `resolveProduct(productId) === null`, nunca em fallback para outro
 * produto e nunca em vazamento de dado de outro artigo.
 *
 * O marcador `data-product-block-status="not-found"` é só um mecanismo de
 * diagnóstico para os testes deste spike — não é uma decisão sobre a UI de
 * produção do "produto não encontrado". Essa decisão visual permanece em
 * aberto, para o contrato/implementação posterior (decisão 3 da UXE-004).
 */

import * as runtime from 'react/jsx-runtime';

export function ProductBlock({ productId, resolveProduct }) {
  const resolved = resolveProduct(productId);

  if (!resolved) {
    return runtime.jsx('div', {
      'data-testid': 'product-block',
      'data-product-block-status': 'not-found',
      'data-product-id': productId,
      children: `not-found:${productId}`,
    });
  }

  const { name, offers } = resolved;

  return runtime.jsx('div', {
    'data-testid': 'product-block',
    'data-product-block-status': 'resolved',
    'data-product-id': productId,
    children: [
      runtime.jsx('span', { 'data-testid': 'product-block-name', children: name }, 'name'),
      runtime.jsx(
        'ul',
        {
          'data-testid': 'product-block-offers',
          children: offers.map((offer) =>
            runtime.jsx(
              'li',
              {
                'data-testid': 'product-block-offer',
                'data-marketplace': offer.marketplace,
                'data-in-stock': String(offer.inStock),
                children: `${offer.marketplace}: ${offer.currency} ${offer.price} (${offer.inStock ? 'em estoque' : 'sem estoque'})`,
              },
              offer.offerId,
            ),
          ),
        },
        'offers',
      ),
    ],
  });
}
