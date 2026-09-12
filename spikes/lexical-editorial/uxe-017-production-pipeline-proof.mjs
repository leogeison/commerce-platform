/**
 * spikes/lexical-editorial/uxe-017-production-pipeline-proof.mjs
 *
 * UXE-017 — prova standalone, fora do Jest, com `@mdx-js/mdx` real e o
 * plugin de produção de verdade (não uma reimplementação/mock).
 *
 * Por que isso existe além dos testes Jest: `product-block-remark-plugin.spec.ts`
 * e `compile-article-body.spec.ts` mockam `unist-util-visit` (ver os
 * comentários desses arquivos) porque `next/jest` não transforma pacotes
 * ESM puros em `node_modules`. Esse mock nunca roda em produção — o bundle
 * real do Next.js resolve `unist-util-visit` real via ESM nativo — mas
 * significa que nenhum teste Jest efetivamente exercitou o plugin de
 * produção contra a biblioteca `unist-util-visit` real, nem contra o
 * `@mdx-js/mdx` real. Este script fecha exatamente essa lacuna, rodando
 * inteiramente fora do Jest (sem alterar nenhuma configuração global de
 * Jest, por decisão explícita) via `node --experimental-strip-types`,
 * importando diretamente:
 *   - o arquivo de produção real:
 *     `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-remark-plugin.ts`
 *   - `@mdx-js/mdx` real (não mockado)
 *   - `unist-util-visit` real (não mockado) — resolvido via
 *     `apps/fastcompre/node_modules`, porque a resolução de módulos do
 *     Node é relativa ao arquivo que faz o `import`, não a este script.
 *
 * Duas provas, ambas exigidas pela decisão de aprovação da UXE-017:
 *
 * 1. Não-interferência: Markdown comum continua compilando/renderizando
 *    normalmente com `format: 'md'` + `remarkPlugins: [remarkProductBlock]`
 *    — o mesmo pipeline usado por `compile-article-body.ts`.
 * 2. Transformação real: um `:::product` válido é reconhecido pelo
 *    pipeline real (parse real do remark, plugin real, `unist-util-visit`
 *    real) e chega como um `mdxJsxFlowElement` referenciando `ProductBlock`
 *    até a renderização React — verificado renderizando o `MDXContent`
 *    compilado com `renderToStaticMarkup` e um componente `ProductBlock`
 *    STUB passado via `components`.
 *
 * O stub abaixo é exclusivo desta prova: não acessa nenhum dado real
 * (Produto/Oferta/API), não é exportado, não é referenciado por nenhum
 * código de produção, e existe só para capturar o `productId` que o
 * pipeline real propaga até a renderização — nunca deve virar um
 * componente de produção (essa decisão pertence à UXE-018).
 *
 * Escopo: assim como o plugin de produção, esta prova não resolve
 * `PublicArticle.products[]`, não cria `ProductBlock` de produção, não
 * toca `page.tsx` e não antecipa nenhuma decisão da UXE-018.
 */

import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { remarkProductBlock } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-remark-plugin.ts';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

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
 * Mesma chamada real de `compile-article-body.ts`: `format: 'md'` +
 * `remarkPlugins: [remarkProductBlock]`, runtime JSX real do React.
 */
async function compile(bodyMdx) {
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
    remarkPlugins: [remarkProductBlock],
  });
  return MDXContent;
}

async function proveCommonMarkdownStillCompilesAndRenders() {
  console.log('\n[1/2] Não-interferência — Markdown comum continua compilando/renderizando');

  const bodyMdx = [
    '# Título do artigo',
    '',
    'Um parágrafo comum, sem nenhuma relação com o bloco de Produto.',
    '',
    '## Subtítulo',
    '',
    '- item 1',
    '- item 2',
  ].join('\n');

  const MDXContent = await compile(bodyMdx);
  const html = renderToStaticMarkup(MDXContent({}));

  assert(typeof MDXContent === 'function', 'evaluate() com Markdown comum resolve para um componente MDXContent');
  assert(html.includes('Título do artigo'), 'o texto do heading real aparece na renderização');
  assert(html.includes('Um parágrafo comum'), 'o texto do parágrafo comum aparece na renderização');
  assert(html.includes('<li>item 1</li>'), 'a lista comum é renderizada normalmente');
  assert(!html.includes('ProductBlock'), 'nenhuma referência a ProductBlock aparece para Markdown sem o bloco');
}

async function proveValidProductBlockReachesStubWithExpectedProductId() {
  console.log('\n[2/2] Transformação real — :::product válido chega ao stub com o productId esperado');

  const bodyMdx = [
    'Texto antes do bloco.',
    '',
    ':::product',
    'version: 1',
    `productId: ${VALID_UUID}`,
    ':::',
    '',
    'Texto depois do bloco.',
  ].join('\n');

  const MDXContent = await compile(bodyMdx);

  let receivedProductId = null;
  // Stub exclusivo desta prova: não acessa dado real, só captura o
  // productId recebido via props para a asserção abaixo.
  function ProductBlockStub(props) {
    receivedProductId = props.productId;
    return null;
  }

  const html = renderToStaticMarkup(MDXContent({ components: { ProductBlock: ProductBlockStub } }));

  assert(receivedProductId === VALID_UUID, `o stub ProductBlock recebeu productId="${receivedProductId}" (esperado "${VALID_UUID}")`);
  assert(html.includes('Texto antes do bloco.'), 'o parágrafo antes do bloco continua sendo renderizado');
  assert(html.includes('Texto depois do bloco.'), 'o parágrafo depois do bloco continua sendo renderizado');
}

async function proveMalformedBlockFailsClosed() {
  console.log('\n[extra] fail-closed — bloco malformado rejeita a Promise de evaluate() (não cai para texto/parágrafo)');

  const bodyMdx = [':::product', 'version: 1', `productId: ${VALID_UUID}`].join('\n'); // sem fechamento

  let threw = false;
  try {
    await compile(bodyMdx);
  } catch {
    threw = true;
  }

  assert(threw, 'evaluate() rejeita para um bloco :::product sem fechamento, em vez de compilar silenciosamente');
}

async function main() {
  await proveCommonMarkdownStillCompilesAndRenders();
  await proveValidProductBlockReachesStubWithExpectedProductId();
  await proveMalformedBlockFailsClosed();

  console.log('\n---');
  if (failures > 0) {
    console.error(`${failures} asserção(ões) falharam.`);
    process.exit(1);
  }
  console.log('Todas as asserções passaram — pipeline real (@mdx-js/mdx + unist-util-visit + plugin de produção) confirmado.');
}

main().catch((error) => {
  console.error('Erro inesperado ao rodar a prova:', error);
  process.exit(1);
});
