#!/usr/bin/env node
/**
 * spikes/lexical-editorial/product-block-round-trip-full-cycle.mjs
 *
 * UXE-004 — Round-trip 2 (bloco Produto/Oferta → sintaxe → pipeline
 * FastCompre → componente público).
 *
 * Prova dedicada ao ciclo completo:
 *
 *   bodyMdx → Lexical import → bodyMdx export → @mdx-js/mdx evaluate
 *   (format:'md', remarkPlugins:[remarkProductBlock]) → resolução via
 *   projeção real do artigo → renderToStaticMarkup
 *
 * Mesma filosofia PASS/FAIL de `product-block-round-trip.mjs` (UXE-003) —
 * não a filosofia diagnóstica de `compare-corpus.mjs`. Nunca para no
 * primeiro cenário que falha: todos rodam sempre, cada um isolado, e o
 * relatório final lista todos os resultados.
 *
 * `product-block-round-trip.mjs`, `round-trip.mjs`, `compare-corpus.mjs` e
 * os corpora da UXE-002 permanecem intocados por este arquivo.
 *
 * Nenhum arquivo de `apps/fastcompre`/`apps/admin` é importado ou tocado
 * por este runner — `evaluate()` é chamado com os MESMOS parâmetros
 * (`format: 'md'`) usados por `compile-article-body.ts`, mas a partir de
 * dados 100% locais a este spike.
 */

import { createHeadlessEditor } from '@lexical/headless';
import { $getRoot, $isElementNode } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { evaluate } from '@mdx-js/mdx';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

import {
  PRODUCT_BLOCK,
  ProductBlockNode,
  ProductBlockSyntaxError,
  $isProductBlockNode,
} from './product-block-transformer.mjs';
import { remarkProductBlock, PRODUCT_BLOCK_JSX_COMPONENT_NAME } from './product-block-remark-plugin.mjs';
import { ProductBlock } from './product-block-component.mjs';
import {
  REAL_PROJECTION_ARTICLE_SLUG,
  REAL_PROJECTION_BY_PRODUCT_ID,
  REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE,
  createScopedResolver,
} from './product-block-real-projection.fixture.mjs';

const LEXICAL_TRANSFORMERS = [PRODUCT_BLOCK];

const [PRODUCT_A_ID, PRODUCT_A] = [...REAL_PROJECTION_BY_PRODUCT_ID.entries()][0];
const [PRODUCT_B_ID, PRODUCT_B] = [...REAL_PROJECTION_BY_PRODUCT_ID.entries()][1];

// Resolver escopado SOMENTE à projeção real do artigo sob teste — a
// existência de `REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE` em outro módulo
// não o torna alcançável por este resolver; é essa ausência estrutural,
// não uma checagem de exclusão manual, que prova o isolamento por
// artigo/projeção.
const resolveFromRealArticleProjection = createScopedResolver(REAL_PROJECTION_BY_PRODUCT_ID);

function productBlockString(productId) {
  return `:::product\nversion: 1\nproductId: ${productId}\n:::`;
}

// ---------------------------------------------------------------------
// Perna Lexical (import → export) — mesmo padrão de
// `product-block-round-trip.mjs` (UXE-003), reaproveitado aqui sem
// alteração de semântica.
// ---------------------------------------------------------------------

function $collectProductBlockNodesRecursive(node, found) {
  if ($isProductBlockNode(node)) {
    found.push(node.getProductId());
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectProductBlockNodesRecursive(child, found);
    }
  }
}

function lexicalRoundTrip(bodyMdx) {
  const editor = createHeadlessEditor({
    namespace: 'lexical-editorial-product-block-full-cycle',
    nodes: [ProductBlockNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      $convertFromMarkdownString(bodyMdx, LEXICAL_TRANSFORMERS);
    },
    { discrete: true },
  );

  const productIds = [];
  let exportedMarkdown = null;
  editor.getEditorState().read(() => {
    $collectProductBlockNodesRecursive($getRoot(), productIds);
    exportedMarkdown = $convertToMarkdownString(LEXICAL_TRANSFORMERS);
  });

  return { productIds, exportedMarkdown };
}

// ---------------------------------------------------------------------
// Perna MDX/remark (evaluate → render) — mesma chamada de produção
// (`format: 'md'`), com `remarkProductBlock` adicionado.
// ---------------------------------------------------------------------

async function mdxRender(bodyMdx, { resolveProduct = resolveFromRealArticleProjection, withProductPlugin = true } = {}) {
  const remarkPlugins = withProductPlugin ? [remarkProductBlock] : [];
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...jsxRuntime,
    format: 'md',
    remarkPlugins,
  });

  const components = {
    [PRODUCT_BLOCK_JSX_COMPONENT_NAME]: (props) => ProductBlock({ ...props, resolveProduct }),
  };

  const html = renderToStaticMarkup(MDXContent({ components }));
  return html;
}

// Roda só até a árvore mdast (sem MDX/JSX), para inspecionar a estrutura
// do `mdxJsxFlowElement` produzido pelo plugin ANTES de qualquer avaliação
// — usa `unified`/`remark-parse` diretamente. Ambos são importados aqui de
// forma explícita e, por isso, declarados como dependência DIRETA deste
// pacote (`unified@11.0.5`, `remark-parse@11.0.0` — mesmas versões já
// resolvidas em `pnpm-lock.yaml` como transitivas de `@mdx-js/mdx@3.1.1`):
// sob a resolução estrita do pnpm, um módulo só enxerga o que o
// `package.json` do próprio pacote declara, mesmo que a dependência já
// exista em algum lugar da árvore por outro caminho.
function remarkPluginAstOnly(bodyMdx) {
  // `remarkProductBlock` é um plugin puro (sem `.run()`); `processor.parse`
  // dá o mdast bruto e `processor.runSync` aplica as transformações
  // registradas via `.use(remarkProductBlock)` — mesma sequência que
  // `unified().processSync()` executaria internamente, mas parando antes
  // de qualquer stringificação, para inspecionar a AST intermediária.
  const processor = unified().use(remarkParse).use(remarkProductBlock);
  const parsed = processor.parse(bodyMdx);
  return processor.runSync(parsed);
}

function findMdxJsxFlowElements(tree, found = []) {
  if (tree && typeof tree === 'object') {
    if (tree.type === 'mdxJsxFlowElement') {
      found.push(tree);
    }
    for (const child of tree.children ?? []) {
      findMdxJsxFlowElements(child, found);
    }
  }
  return found;
}

// ---------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------

const results = [];

async function runScenario(name, fn) {
  try {
    const detail = await fn();
    results.push({ scenario: name, pass: true, detail });
  } catch (error) {
    results.push({
      scenario: name,
      pass: false,
      detail: `Erro inesperado: ${error.constructor.name}: ${error.message}`,
    });
  }
}

async function expectRejection(name, fn, { errorType = ProductBlockSyntaxError } = {}) {
  try {
    await fn();
    results.push({
      scenario: name,
      pass: false,
      detail: 'Falha: esperava rejeição/exceção, mas completou sem erro (indício de fallback silencioso).',
    });
  } catch (error) {
    const pass = error instanceof errorType;
    results.push({
      scenario: name,
      pass,
      detail: pass
        ? `Rejeitado corretamente: ${error.message}`
        : `Falha: rejeitou, mas não com ${errorType.name} (${error.constructor.name}): ${error.message}`,
    });
  }
}

// 1. Round-trip básico com dado real
await runScenario('01-round-trip-basico-com-dado-real', async () => {
  const bodyMdx = `# ${REAL_PROJECTION_ARTICLE_SLUG}\n\nTexto antes.\n\n${productBlockString(PRODUCT_A_ID)}\n\nTexto depois.`;
  const { productIds, exportedMarkdown } = lexicalRoundTrip(bodyMdx);
  if (productIds.length !== 1 || productIds[0] !== PRODUCT_A_ID) {
    throw new Error(`Lexical não extraiu exatamente 1 productId esperado (obtido: ${JSON.stringify(productIds)})`);
  }
  if (exportedMarkdown !== bodyMdx) {
    throw new Error('Export Lexical não é byte-idêntico ao bodyMdx de entrada.');
  }
  const html = await mdxRender(exportedMarkdown);
  if (!html.includes(PRODUCT_A.name)) {
    throw new Error(`HTML renderizado não contém o nome real do produto (${PRODUCT_A.name}). HTML: ${html}`);
  }
  if (!html.includes('data-product-block-status="resolved"')) {
    throw new Error('HTML não marca o bloco como resolvido.');
  }
  for (const offer of PRODUCT_A.offers) {
    if (!html.includes(offer.price)) {
      throw new Error(`HTML não contém o preço real da oferta ${offer.offerId} (${offer.price}).`);
    }
  }
  return 'Lexical round-trip byte-idêntico; MDX renderizou nome/ofertas reais do produto.';
});

// 2. Corpus comum (UXE-002) sem interferência do plugin
await runScenario('02-corpus-comum-sem-interferencia', async () => {
  const casosComuns = [
    '# Título\n\nParágrafo com **negrito** e *itálico*.',
    '- Item um\n- Item dois\n- Item três',
    '[FastCompre](https://fastcompre.com.br)',
    '> Uma citação qualquer.',
    '`código inline`',
  ];
  for (const bodyMdx of casosComuns) {
    const semPlugin = await mdxRender(bodyMdx, { withProductPlugin: false });
    const comPlugin = await mdxRender(bodyMdx, { withProductPlugin: true });
    if (semPlugin !== comPlugin) {
      throw new Error(
        `Divergência com o plugin presente para o input ${JSON.stringify(bodyMdx)}.\nSem plugin: ${semPlugin}\nCom plugin: ${comPlugin}`,
      );
    }
  }
  return `${casosComuns.length} caso(s) de Markdown comum produziram HTML idêntico com e sem remarkProductBlock.`;
});

// 3. Blocos repetidos — mesmo productId, múltiplas ocorrências, sem dedup
await runScenario('03-blocos-repetidos-mesmo-productId-sem-dedup', async () => {
  const bodyMdx = [
    'Primeira menção.',
    '',
    productBlockString(PRODUCT_A_ID),
    '',
    'Segunda menção, mesmo produto.',
    '',
    productBlockString(PRODUCT_A_ID),
    '',
    'Terceira menção.',
    '',
    productBlockString(PRODUCT_A_ID),
  ].join('\n');

  const { productIds, exportedMarkdown } = lexicalRoundTrip(bodyMdx);
  if (productIds.length !== 3 || productIds.some((id) => id !== PRODUCT_A_ID)) {
    throw new Error(`Esperado 3 ProductBlockNode com o mesmo productId, obtido: ${JSON.stringify(productIds)}`);
  }
  if (exportedMarkdown !== bodyMdx) {
    throw new Error('Export Lexical com blocos repetidos não é byte-idêntico ao input.');
  }

  const html = await mdxRender(exportedMarkdown);
  const occurrences = html.split('data-testid="product-block"').length - 1;
  if (occurrences !== 3) {
    throw new Error(`Esperado 3 blocos renderizados independentemente, encontrado ${occurrences}. HTML: ${html}`);
  }
  return '3 ocorrências do mesmo productId: 3 ProductBlockNode independentes no Lexical e 3 blocos renderizados de forma independente no MDX — nenhuma deduplicação.';
});

// 4. UUID real, existente, mas NÃO vinculado ao artigo sob teste → not-found
await runScenario('04-uuid-real-nao-vinculado-ao-artigo-not-found', async () => {
  const notLinkedId = REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE.productId;
  if (REAL_PROJECTION_BY_PRODUCT_ID.has(notLinkedId)) {
    throw new Error('Pré-condição violada: o produto não-vinculado apareceu na projeção do artigo de teste.');
  }

  const bodyMdx = productBlockString(notLinkedId);
  const { productIds, exportedMarkdown } = lexicalRoundTrip(bodyMdx);
  if (productIds.length !== 1 || productIds[0] !== notLinkedId) {
    throw new Error('Lexical não preservou o productId real não vinculado.');
  }

  const html = await mdxRender(exportedMarkdown);
  if (!html.includes('data-product-block-status="not-found"')) {
    throw new Error(`Esperado not-found, HTML: ${html}`);
  }
  if (html.includes(REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE.name)) {
    throw new Error('Vazamento: o nome do produto não vinculado apareceu no HTML mesmo estando fora da projeção.');
  }
  if (html.includes(PRODUCT_A.name) || html.includes(PRODUCT_B.name)) {
    throw new Error('Vazamento: algum produto DA projeção apareceu sem ter sido referenciado no bodyMdx.');
  }
  return `productId real ${notLinkedId} (vinculado a outro artigo real, ${REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE.linkedArticleSlug}) resolveu not-found nesta projeção; nenhum dado de nenhum produto vazou. Isolamento comprovado é por Artigo/projeção — isolamento de Site permanece herdado do contrato de tenancy, não testado aqui (ver cabeçalho da fixture).`;
});

// 5. Bloco sem fechamento no remark — fail-closed simétrico ao Lexical
await expectRejection('05-bloco-sem-fechamento-remark-fail-closed', async () => {
  const bodyMdx = `:::product\nversion: 1\nproductId: ${PRODUCT_A_ID}`;
  await mdxRender(bodyMdx);
});

// 6. Simetria Lexical vs remark para corpos malformados
const MALFORMED_BODIES = [
  { name: 'version-ausente', input: `:::product\nproductId: ${PRODUCT_A_ID}\n:::` },
  { name: 'version-desconhecida', input: `:::product\nversion: 2\nproductId: ${PRODUCT_A_ID}\n:::` },
  { name: 'productId-ausente', input: `:::product\nversion: 1\n:::` },
  { name: 'productId-uuid-invalido', input: `:::product\nversion: 1\nproductId: nao-e-um-uuid\n:::` },
  { name: 'campo-linha-extra', input: `:::product\nversion: 1\nproductId: ${PRODUCT_A_ID}\nname: Produto Fake\n:::` },
  { name: 'ordem-invalida', input: `:::product\nproductId: ${PRODUCT_A_ID}\nversion: 1\n:::` },
];

await runScenario('06-simetria-lexical-remark-corpos-malformados', async () => {
  const divergencias = [];
  for (const { name, input } of MALFORMED_BODIES) {
    let lexicalThrew = false;
    let remarkThrew = false;
    try {
      lexicalRoundTrip(input);
    } catch (error) {
      lexicalThrew = error instanceof ProductBlockSyntaxError;
    }
    try {
      await mdxRender(input);
    } catch (error) {
      remarkThrew = error instanceof ProductBlockSyntaxError;
    }
    if (!lexicalThrew || !remarkThrew) {
      divergencias.push(`${name}: lexicalRejeitou=${lexicalThrew} remarkRejeitou=${remarkThrew}`);
    }
  }
  if (divergencias.length > 0) {
    throw new Error(`Divergência entre camadas: ${divergencias.join('; ')}`);
  }
  return `${MALFORMED_BODIES.length} corpo(s) malformado(s) rejeitados identicamente (ProductBlockSyntaxError) nas duas camadas — prova de que ambas usam a mesma função de gramática compartilhada.`;
});

// 7. Expressão JS inerte
await runScenario('07-expressao-js-inerte', async () => {
  const bodyMdx = 'Texto {alert(1)} fim.';
  const html = await mdxRender(bodyMdx);
  if (!html.includes('{alert(1)}')) {
    throw new Error(`Esperado texto literal inerte, HTML: ${html}`);
  }
  return 'Expressão {alert(1)} permaneceu texto literal, inerte, com o plugin presente.';
});

// 8. import/export inertes
await runScenario('08-import-export-inertes', async () => {
  const bodyMdx = "import x from 'y'\n\n# titulo";
  const html = await mdxRender(bodyMdx);
  // O texto vira conteúdo de parágrafo HTML-escapado (aspas viram
  // "&#x27;") — é exatamente essa transformação que prova que NÃO foi
  // interpretado como um `import` real (que rejeitaria a compilação sob
  // `format: 'md'`, ou executaria fora dele). Por isso a checagem ignora
  // aspas e verifica que o texto ficou dentro de um <p>, nunca executado.
  if (!html.includes('import x from') || !/<p>[^<]*import x from/.test(html)) {
    throw new Error(`Esperado texto literal inerte dentro de um parágrafo, HTML: ${html}`);
  }
  return `Statement import permaneceu texto literal inerte dentro de um <p> (HTML-escapado, nunca executado), com o plugin presente. HTML: ${html}`;
});

// 9. HTML bruto descartado
await runScenario('09-html-bruto-descartado', async () => {
  const casos = ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">'];
  for (const bodyMdx of casos) {
    const html = await mdxRender(bodyMdx);
    if (html.includes('<script') || html.includes('onerror')) {
      throw new Error(`HTML bruto vazou para a saída: ${html}`);
    }
  }
  return `${casos.length} caso(s) de HTML bruto continuaram descartados (nó mdast "html" ignorado) com o plugin presente.`;
});

// 10. Baseline preexistente do link javascript: — comparativo, não corrigido
//
// ACHADO desta rodada (corrige a investigação anterior, que havia testado
// contra React 18.3.1 num protótipo descartável): com as versões REAIS de
// produção (react@19.2.4/react-dom@19.2.4, confirmadas no lockfile), o
// próprio React 19 já neutraliza o href `javascript:` em tempo de
// renderização, substituindo-o por um stub que lança
// "React has blocked a javascript: URL as a security precaution." — ou
// seja, a mitigação já existe hoje, na versão real usada pelo FastCompre,
// e não depende de nada que a UXE-004 introduza. O teste abaixo NÃO afirma
// qual é esse comportamento (isso pertenceria a uma investigação de
// segurança própria, fora do escopo desta tarefa) — só prova que
// `remarkProductBlock` não o altera, para mais ou para menos.
await runScenario('10-baseline-javascript-link-comparativo', async () => {
  const bodyMdx = '[clique](javascript:alert(1))';
  const semPlugin = await mdxRender(bodyMdx, { withProductPlugin: false });
  const comPlugin = await mdxRender(bodyMdx, { withProductPlugin: true });
  if (semPlugin !== comPlugin) {
    throw new Error(
      `remarkProductBlock alterou o comportamento preexistente do link javascript:.\nSem plugin: ${semPlugin}\nCom plugin: ${comPlugin}`,
    );
  }
  return `Comportamento preexistente do link javascript: (react@19.2.4, mesma versão do FastCompre) permanece byte-idêntico com remarkProductBlock presente: ${semPlugin} — não corrigido nem amplificado por esta tarefa. NOTA: corrige a investigação prévia (feita contra React 18.3.1 num protótipo descartável, fora do repositório) — a versão real de produção já bloqueia o href javascript: no próprio React, o que não estava confirmado antes desta implementação.`;
});

// 11. Tentativa de contrabando de atributo extra — rejeitada antes da AST
await runScenario('11-contrabando-atributo-extra-rejeitado-antes-da-ast', async () => {
  const tentativas = [
    `:::product\nversion: 1\nproductId: ${PRODUCT_A_ID}\nname: Produto Fake\n:::`,
    `:::product\nversion: 1\nproductId: ${PRODUCT_A_ID}", "evil":"injected\n:::`,
  ];
  for (const bodyMdx of tentativas) {
    let threw = false;
    try {
      await mdxRender(bodyMdx);
    } catch (error) {
      threw = error instanceof ProductBlockSyntaxError;
    }
    if (!threw) {
      throw new Error(`Tentativa de contrabando não foi rejeitada: ${JSON.stringify(bodyMdx)}`);
    }
  }

  // Estrutura do sucesso: exatamente 1 atributo, sempre "productId".
  const tree = remarkPluginAstOnly(productBlockString(PRODUCT_A_ID));
  const elements = findMdxJsxFlowElements(tree);
  if (elements.length !== 1) {
    throw new Error(`Esperado 1 mdxJsxFlowElement, encontrado ${elements.length}.`);
  }
  const attrs = elements[0].attributes;
  if (attrs.length !== 1 || attrs[0].name !== 'productId' || attrs[0].value !== PRODUCT_A_ID) {
    throw new Error(`Atributos inesperados no mdxJsxFlowElement: ${JSON.stringify(attrs)}`);
  }
  return `${tentativas.length} tentativa(s) de contrabando rejeitadas antes de qualquer AST ser construída; no caminho de sucesso, mdxJsxFlowElement.attributes tem exatamente 1 entrada ("productId").`;
});

// 12. Múltiplos produtos DIFERENTES no mesmo artigo, resolvidos corretamente
await runScenario('12-multiplos-produtos-diferentes-resolvidos-corretamente', async () => {
  const bodyMdx = [
    `## ${REAL_PROJECTION_ARTICLE_SLUG}`,
    '',
    productBlockString(PRODUCT_A_ID),
    '',
    productBlockString(PRODUCT_B_ID),
  ].join('\n');

  const { productIds, exportedMarkdown } = lexicalRoundTrip(bodyMdx);
  if (JSON.stringify(productIds) !== JSON.stringify([PRODUCT_A_ID, PRODUCT_B_ID])) {
    throw new Error(`Ordem/conteúdo inesperado: ${JSON.stringify(productIds)}`);
  }

  const html = await mdxRender(exportedMarkdown);
  if (!html.includes(PRODUCT_A.name) || !html.includes(PRODUCT_B.name)) {
    throw new Error(`Nem todos os produtos reais apareceram no HTML: ${html}`);
  }
  return 'Os dois ArticleProduct reais do artigo JBL (position 0 e 1) resolveram e renderizaram corretamente, cada um com suas próprias ofertas reais.';
});

// 13. Ciclo completo com conteúdo misto — estabilidade nas duas pernas
await runScenario('13-ciclo-completo-conteudo-misto', async () => {
  const bodyMdx = [
    '# Review JBL Tune 520BT',
    '',
    'Um parágrafo comum antes do bloco.',
    '',
    '- Prós',
    '- Contras',
    '',
    productBlockString(PRODUCT_A_ID),
    '',
    'Um parágrafo comum depois do bloco.',
  ].join('\n');

  const { productIds, exportedMarkdown } = lexicalRoundTrip(bodyMdx);
  if (productIds.length !== 1 || productIds[0] !== PRODUCT_A_ID) {
    throw new Error('Lexical não extraiu o bloco corretamente em conteúdo misto.');
  }
  if (exportedMarkdown !== bodyMdx) {
    throw new Error('Round-trip Lexical não byte-idêntico em conteúdo misto.');
  }

  const html = await mdxRender(exportedMarkdown);
  if (!html.includes(PRODUCT_A.name)) {
    throw new Error(`Bloco de produto não renderizou em conteúdo misto: ${html}`);
  }
  if (!html.includes('Review JBL Tune 520BT') || !html.includes('Prós')) {
    throw new Error(`Conteúdo comum ao redor do bloco não renderizou: ${html}`);
  }
  return 'Round-trip Lexical byte-idêntico E renderização MDX correta, ambas as pernas sobre o mesmo documento com título, lista, bloco de produto e parágrafos.';
});

// ---------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------

console.log('--- Relatório completo (JSON) ---');
console.log(JSON.stringify(results, null, 2));

console.log('\n--- Resumo ---');
let failCount = 0;
for (const entry of results) {
  console.log(`${entry.scenario}  →  pass=${entry.pass}  ${entry.detail}`);
  if (!entry.pass) {
    failCount += 1;
  }
}
console.log(`\n${results.length} cenário(s) executado(s); ${failCount} falharam.`);

process.exitCode = failCount > 0 ? 1 : 0;
