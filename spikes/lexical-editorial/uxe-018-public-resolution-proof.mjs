/**
 * spikes/lexical-editorial/uxe-018-public-resolution-proof.mjs
 *
 * UXE-018 — prova standalone, fora do Jest, com `@mdx-js/mdx` real, o
 * plugin de produção real (`remarkProductBlock`, UXE-017) e o resolver de
 * produção real (`resolveProductBlock`, UXE-018).
 *
 * Por que isso existe além dos testes Jest: exatamente a mesma lacuna já
 * documentada em `uxe-017-production-pipeline-proof.mjs` — `next/jest` não
 * transforma pacotes ESM puros de `node_modules` (`@mdx-js/mdx`,
 * `unist-util-visit`), então nenhum teste Jest roda `evaluate()` real.
 * `product-block.spec.tsx` (UXE-018) prova a integração real entre o
 * plugin e o componente de produção simulando só a "cola" do runtime MDX
 * (`components[nome] → createElement`, boilerplate genérico do
 * `@mdx-js/mdx`) — mas não roda `evaluate()` de verdade. Este script fecha
 * essa lacuna específica, rodando inteiramente fora do Jest (sem alterar
 * nenhuma configuração global de Jest) via `node --experimental-strip-
 * types`, importando diretamente:
 *   - `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts`
 *     (produção real — por sua vez importa o `remarkProductBlock` real e,
 *     através dele, `@commerce-platform/editorial` real)
 *   - `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-resolver.ts`
 *     (produção real, UXE-018)
 *   - `@mdx-js/mdx` real (não mockado)
 *   - `unist-util-visit` real (não mockado) — resolvido via
 *     `apps/fastcompre/node_modules`, mesma observação de resolução do
 *     script da UXE-017.
 *
 * Limitação explícita deste script (documentada, não escondida): a marcação
 * JSX de `product-block.tsx` em si não pode ser importada por
 * `node --experimental-strip-types` (que remove apenas anotações de tipo
 * TypeScript, não transforma sintaxe JSX) sem adicionar uma nova
 * ferramenta de build ao ambiente — decisão explícita de não fazer isso
 * nesta tarefa. Por isso a função `renderProductBlock` abaixo é um espelho
 * local, escrito com `React.createElement`, da mesma árvore/regras já
 * implementadas em `product-block.tsx` (found/not-found, `offers: []`,
 * `every((offer) => !offer.inStock)`) — mas a RESOLUÇÃO em si
 * (`resolveProductBlock`) é a função de produção real, importada, não
 * reimplementada. A fidelidade exata da marcação JSX de produção (nomes de
 * tag, atributos, texto) é coberta, com o componente de produção real
 * (via SWC/Jest, que transforma JSX normalmente), por `product-block.spec.tsx`.
 *
 * Duas provas:
 * 1. Pipeline real ponta a ponta — `bodyMdx` real → `compileArticleBody`
 *    real (evaluate real + remarkProductBlock real + unist-util-visit
 *    real) → `MDXContent` real → renderizado com `resolveProductBlock`
 *    real contra um fixture de `products[]`.
 * 2. Prova V1/V2 — o MESMO `MDXContent` (compilado uma única vez)
 *    renderizado duas vezes com fixtures de Produto diferentes para o
 *    mesmo `productId`/`offerId`, provando que preço/disponibilidade vêm
 *    de `article.products[]` no momento da renderização, não de um
 *    snapshot gravado em `bodyMdx` — o mesmo `bodyMdx`/`MDXContent` nunca
 *    muda entre as duas renderizações.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { compileArticleBody } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts';
import { resolveProductBlock } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-resolver.ts';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const OFFER_ID = '22222222-2222-4222-8222-222222222222';
const ARTICLE_ID = '99999999-9999-4999-8999-999999999999';

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`✗ FALHOU: ${message}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

/**
 * Espelho local, com `React.createElement`, da árvore/regras de
 * `product-block.tsx` — ver a nota de limitação de ambiente no cabeçalho
 * deste arquivo sobre por que o componente de produção real (JSX) não
 * pode ser importado diretamente aqui. A RESOLUÇÃO (`resolveProductBlock`)
 * usada abaixo é a função de produção real, importada, não reimplementada.
 */
function renderProductBlock(products, articleId, productId) {
  const resolution = resolveProductBlock(products, productId);

  if (resolution.status === 'not-found') {
    return createElement('div', null, createElement('p', null, 'Produto não disponível.'));
  }

  const { product } = resolution;
  const hasOffers = product.offers.length > 0;
  const isUnavailable = product.offers.every((offer) => !offer.inStock);

  return createElement(
    'div',
    null,
    createElement('p', null, createElement('strong', null, product.name)),
    product.description ? createElement('p', null, product.description) : null,
    isUnavailable ? createElement('p', null, 'Temporariamente indisponível') : null,
    hasOffers
      ? createElement(
          'ul',
          null,
          product.offers.map((offer) =>
            createElement(
              'li',
              { key: offer.id },
              offer.inStock
                ? createElement(
                    'a',
                    { href: `http://localhost:3000/r/test-site/${offer.id}?articleId=${articleId}`, target: '_blank' },
                    `${offer.marketplace} — ${offer.price} ${offer.currency}`,
                  )
                : `${offer.marketplace} — ${offer.price} ${offer.currency} (indisponível)`,
            ),
          ),
        )
      : null,
  );
}

function buildProduct(overrides) {
  return {
    id: PRODUCT_ID,
    name: 'Produto da prova standalone',
    description: null,
    imageUrl: null,
    position: 0,
    offers: [],
    ...overrides,
  };
}

const BODY_MDX = [
  'Texto antes do bloco.',
  '',
  ':::product',
  'version: 1',
  `productId: ${PRODUCT_ID}`,
  ':::',
  '',
  'Texto depois do bloco.',
].join('\n');

async function provePipelineRealPontaAPonta() {
  console.log('\n[1/2] Pipeline real ponta a ponta — compileArticleBody real resolve contra products[] real (resolveProductBlock real)');

  const MDXContent = await compileArticleBody(BODY_MDX);
  const product = buildProduct({
    offers: [{ id: OFFER_ID, marketplace: 'AMAZON_BR', price: '199.90', currency: 'BRL', inStock: true }],
  });

  const html = renderToStaticMarkup(
    MDXContent({
      components: {
        ProductBlock: ({ productId }) => renderProductBlock([product], ARTICLE_ID, productId),
      },
    }),
  );

  assert(html.includes('Texto antes do bloco.'), 'texto antes do bloco continua renderizado');
  assert(html.includes('Texto depois do bloco.'), 'texto depois do bloco continua renderizado');
  assert(html.includes('Produto da prova standalone'), 'nome do Product resolvido aparece na renderização');
  assert(html.includes('199.90 BRL'), 'preço da Oferta resolvida aparece na renderização');
}

async function proveV1V2SemSnapshotComercialNoCorpo() {
  console.log('\n[2/2] Prova V1/V2 — mesmo bodyMdx/MDXContent (compilado uma única vez) reflete mudança de preço/disponibilidade sem alteração do MDX');

  // `compileArticleBody` chamado UMA ÚNICA VEZ — o mesmo `MDXContent` é
  // renderizado duas vezes abaixo, com fixtures de `products` diferentes.
  const MDXContent = await compileArticleBody(BODY_MDX);

  const productV1 = buildProduct({
    offers: [{ id: OFFER_ID, marketplace: 'AMAZON_BR', price: '199.90', currency: 'BRL', inStock: true }],
  });
  const productV2 = buildProduct({
    offers: [{ id: OFFER_ID, marketplace: 'AMAZON_BR', price: '179.90', currency: 'BRL', inStock: false }],
  });

  const htmlV1 = renderToStaticMarkup(
    MDXContent({ components: { ProductBlock: ({ productId }) => renderProductBlock([productV1], ARTICLE_ID, productId) } }),
  );
  const htmlV2 = renderToStaticMarkup(
    MDXContent({ components: { ProductBlock: ({ productId }) => renderProductBlock([productV2], ARTICLE_ID, productId) } }),
  );

  assert(htmlV1.includes('199.90 BRL') && !htmlV1.includes('Temporariamente indisponível'), 'renderização V1: preço 199.90 e sem aviso de indisponibilidade');
  assert(htmlV2.includes('179.90 BRL') && htmlV2.includes('Temporariamente indisponível'), 'renderização V2: preço 179.90 e com aviso de indisponibilidade');
  assert(htmlV1 !== htmlV2, 'as duas renderizações do MESMO MDXContent diferem — nenhum dado comercial está gravado no bodyMdx/AST');
}

async function main() {
  await provePipelineRealPontaAPonta();
  await proveV1V2SemSnapshotComercialNoCorpo();

  console.log('\n---');
  if (failures > 0) {
    console.error(`${failures} asserção(ões) falharam.`);
    process.exit(1);
  }
  console.log('Todas as asserções passaram — pipeline real (@mdx-js/mdx + unist-util-visit + remarkProductBlock + resolveProductBlock, todos de produção) confirmado.');
}

main().catch((error) => {
  console.error('Erro inesperado ao rodar a prova:', error);
  process.exit(1);
});
