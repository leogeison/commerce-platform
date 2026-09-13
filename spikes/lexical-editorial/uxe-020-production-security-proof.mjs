/**
 * spikes/lexical-editorial/uxe-020-production-security-proof.mjs
 *
 * UXE-020 — Verificação de segurança da extensão do pipeline (repetição
 * contra produção real).
 *
 * Repete, contra a implementação de produção real de `apps/fastcompre`
 * (não mais o protótipo de spike), os mesmos 5 cenários normativos de
 * segurança já provados em `product-block-round-trip-full-cycle.mjs`
 * (UXE-004, cenários 07–11) contra cópias locais do spike — consolidados
 * como GARANTIA NORMATIVA no Editorial Serialization Contract §7, mas lá
 * explicitamente marcados como LIMITAÇÃO CONHECIDA: "toda a verificação de
 * segurança acima foi feita em ambiente de spike, nunca contra a
 * implementação de produção real".
 *
 * Desenho aprovado (decisões fechadas na revisão da UXE-020, todas
 * vinculantes para este arquivo):
 *
 * 1. `components.ProductBlock` usa um stub local mínimo
 *    (`ProductBlockCaptureStub` abaixo) — nenhuma montagem/importação de
 *    `product-block.tsx` real (mesma limitação de ambiente já documentada
 *    na UXE-018: `--experimental-strip-types` não transforma JSX). O stub
 *    nunca interpreta as props recebidas como marcação/executável — só as
 *    serializa como texto literal inerte (`JSON.stringify`), e nunca deixa
 *    de registrar o que recebeu: se uma tentativa de contrabando algum dia
 *    chegar até aqui (não deveria — a gramática rejeita antes da AST
 *    existir), o stub expõe exatamente o que chegou, em vez de mascarar.
 * 2. Os 5 cenários normativos (07–11) vivem juntos, neste único arquivo
 *    standalone — nenhuma asserção duplicada foi adicionada a
 *    `product-block-remark-plugin.spec.ts` ou a qualquer outra spec Jest
 *    nesta tarefa.
 * 3. Nenhum cenário adicional (bloco aninhado em citação/lista, múltiplos
 *    blocos no mesmo documento, quase-opener escapando a regex) foi
 *    incluído — fora do escopo desta rodada por decisão explícita.
 * 4. Nenhum teste de `resolveProductBlock`/not-found/data-leakage — essa
 *    propriedade pertence à UXE-018 e já tem cobertura própria
 *    (`product-block.spec.tsx`). Esta prova permanece focada na segurança
 *    do pipeline MDX (parser/gramática/compilação), não na resolução.
 * 5. Bloqueadores desta tarefa (qualquer um interrompe com exit code
 *    não-zero, nunca corrigido silenciosamente):
 *    - expressão JS/JSX ou import/export tornando-se executável;
 *    - HTML perigoso chegando à saída como conteúdo ativo;
 *    - `remarkProductBlock` tornando o comportamento de `javascript:` mais
 *      permissivo que o baseline equivalente sem o plugin;
 *    - contrabando bem-sucedido de atributos/dados extras pelo
 *      `:::product`;
 *    - entrada que a gramática normativa deveria rejeitar deixando de
 *      falhar de forma fail-closed.
 * 6. Cenário `javascript:` (10) preserva o caráter COMPARATIVO da prova
 *    original: o objetivo é só demonstrar que `remarkProductBlock` não
 *    cria uma superfície nova em relação ao baseline equivalente sem o
 *    plugin — não é uma auditoria geral da política de links Markdown do
 *    projeto.
 * 7. `@mdx-js/mdx`, `remarkProductBlock` e `@commerce-platform/editorial`
 *    (via a cadeia de import real de `compile-article-body.ts`/
 *    `product-block-remark-plugin.ts`) são todos reais — nenhum mock. O
 *    caminho "depois" usa `compileArticleBody` real de produção sempre que
 *    aplicável (cenários 07, 08, 09, 10-com-plugin, 11-malformados,
 *    11-válido-render). O baseline "sem plugin" do cenário 10 usa
 *    `evaluate(bodyMdx, { ...runtime, format: 'md' })` sem
 *    `remarkPlugins` — a mesma reconstrução metodológica já aprovada e
 *    rotulada como "baseline equivalente pré-plugin" na UXE-019 (duplicada
 *    aqui como um helper local de poucas linhas, não importada de lá, para
 *    não modificar nem depender do arquivo da UXE-019).
 * 8. Escopo físico: só este arquivo é criado. `ts-extension-resolve-
 *    loader.mjs` é reutilizado sem modificação. Nenhum arquivo de
 *    produção, Contract, corpus, spec Jest, `package.json`, CI ou
 *    `page.tsx` é alterado.
 * 9. Se qualquer cenário 07–11 revelar uma violação, esta tarefa NÃO
 *    corrige a implementação de produção na mesma rodada — reporta o
 *    achado (entrada, comportamento esperado, comportamento observado,
 *    superfície afetada) para nova decisão arquitetural.
 *
 * Comando de execução (a partir de `spikes/lexical-editorial/`):
 *   node --experimental-strip-types \
 *     --experimental-loader ./ts-extension-resolve-loader.mjs \
 *     uxe-020-production-security-proof.mjs
 *
 * Código de saída: não-zero se qualquer cenário for classificado como
 * bloqueador (violação de segurança) ou como erro técnico de execução.
 */

import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { compileArticleBody } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts';
import { remarkProductBlock } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block-remark-plugin.ts';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

// Decisão 1 — stub local mínimo. Nunca interpreta `props` como marcação ou
// código: apenas serializa como texto literal inerte, para que qualquer
// dado inesperado que chegasse até aqui ficasse visível na saída HTML
// (nunca mascarado), em vez de ser executado ou descartado silenciosamente.
const capturedProductBlockProps = [];
function ProductBlockCaptureStub(props) {
  capturedProductBlockProps.push(props);
  return `[[ProductBlockCaptureStub:${JSON.stringify(props)}]]`;
}

// Mesma composição relevante de produção de `page.tsx`
// (`<MDXContent components={{ h1: 'h2' }} />`), acrescida do stub acima em
// `ProductBlock` — chave adicional e inofensiva quando nenhum
// `mdxJsxFlowElement` a referencia (nenhum dos 5 cenários produz um bloco
// `:::product` válido que sobreviva até a renderização; ela só existe para
// nunca deixar uma renderização inesperada travar num erro genérico de
// "componente não fornecido" em vez de expor o que de fato chegou).
function renderProductionComposition(MDXContent) {
  return renderToStaticMarkup(MDXContent({ components: { h1: 'h2', ProductBlock: ProductBlockCaptureStub } }));
}

// Decisão 7 — baseline equivalente pré-plugin, mesma reconstrução
// metodológica já aprovada na UXE-019 (duplicada aqui como helper local,
// não importada, para não modificar nem depender daquele arquivo).
async function compileBaselinePrePlugin(bodyMdx) {
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
  });
  return MDXContent;
}

// Mesmo helper AST-only de `product-block-round-trip-full-cycle.mjs`
// (UXE-004) — roda só até a árvore mdast (sem MDX/JSX), usando o plugin de
// produção real, para inspecionar a estrutura do `mdxJsxFlowElement` ANTES
// de qualquer avaliação/renderização.
function remarkPluginAstOnly(bodyMdx) {
  const processor = unified().use(remarkParse).use(remarkProductBlock);
  const parsed = processor.parse(bodyMdx);
  return processor.runSync(parsed);
}

function findMdxJsxFlowElements(tree, found = []) {
  if (tree && typeof tree === 'object') {
    if (tree.type === 'mdxJsxFlowElement') {
      found.push(tree);
    }
    for (const value of Object.values(tree)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          findMdxJsxFlowElements(item, found);
        }
      }
    }
  }
  return found;
}

const results = [];

async function runScenario(id, description, fn) {
  try {
    const outcome = await fn();
    results.push({ id, description, blocking: false, ...outcome });
  } catch (error) {
    results.push({
      id,
      description,
      blocking: true,
      classification: 'error',
      detail: `Erro técnico inesperado (não uma asserção deliberada de segurança): ${error.message}`,
    });
  }
}

// --- Cenário 07 — expressão JS inerte ---------------------------------
await runScenario('07-expressao-js-inerte', 'Expressão JS/JSX não se torna executável', async () => {
  const input = 'Texto {alert(1)} fim.';
  const MDXContent = await compileArticleBody(input);
  const html = renderProductionComposition(MDXContent);
  const ok = html.includes('{alert(1)}');
  return {
    blocking: !ok,
    classification: ok ? 'inerte-confirmado' : 'VIOLAÇÃO',
    input,
    observedHtml: html,
    detail: ok
      ? 'Expressão {alert(1)} permaneceu texto literal inerte, com o plugin de produção presente.'
      : `Esperado texto literal "{alert(1)}" na saída; HTML observado não o contém. HTML: ${html}`,
  };
});

// --- Cenário 08 — import/export inertes --------------------------------
await runScenario('08-import-export-inertes', 'Statement import/export não se torna executável', async () => {
  const input = "import x from 'y'\n\n# titulo";
  const MDXContent = await compileArticleBody(input);
  const html = renderProductionComposition(MDXContent);
  const ok = html.includes('import x from') && /<p>[^<]*import x from/.test(html);
  return {
    blocking: !ok,
    classification: ok ? 'inerte-confirmado' : 'VIOLAÇÃO',
    input,
    observedHtml: html,
    detail: ok
      ? 'Statement import permaneceu texto literal inerte dentro de um <p> (nunca executado), com o plugin de produção presente.'
      : `Esperado texto literal inerte dentro de um parágrafo; HTML observado: ${html}`,
  };
});

// --- Cenário 09 — HTML bruto descartado --------------------------------
await runScenario('09-html-bruto-descartado', 'HTML perigoso (<script>, onerror) não chega como conteúdo ativo', async () => {
  const inputs = ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">'];
  const perCase = [];
  let anyViolation = false;
  for (const input of inputs) {
    const MDXContent = await compileArticleBody(input);
    const html = renderProductionComposition(MDXContent);
    const violated = html.includes('<script') || html.includes('onerror');
    if (violated) {
      anyViolation = true;
    }
    perCase.push({ input, observedHtml: html, violated });
  }
  return {
    blocking: anyViolation,
    classification: anyViolation ? 'VIOLAÇÃO' : 'descartado-confirmado',
    cases: perCase,
    detail: anyViolation
      ? `HTML bruto vazou para a saída em pelo menos um caso: ${JSON.stringify(perCase.filter((c) => c.violated))}`
      : `${inputs.length} caso(s) de HTML bruto continuaram descartados (nó mdast "html" ignorado), com o plugin de produção presente.`,
  };
});

// --- Cenário 10 — baseline comparativo do link javascript: -------------
await runScenario(
  '10-baseline-javascript-link-comparativo',
  'remarkProductBlock não torna o link javascript: mais permissivo que o baseline sem o plugin',
  async () => {
    const input = '[clique](javascript:alert(1))';
    const semPlugin = renderProductionComposition(await compileBaselinePrePlugin(input));
    const comPlugin = renderProductionComposition(await compileArticleBody(input));
    const identical = semPlugin === comPlugin;
    return {
      blocking: !identical,
      classification: identical ? 'equivalente-confirmado' : 'VIOLAÇÃO',
      input,
      semPluginHtml: semPlugin,
      comPluginHtml: comPlugin,
      detail: identical
        ? `Comportamento do link javascript: permanece byte-idêntico com/sem remarkProductBlock (produção real): ${comPlugin} — não auditamos aqui se esse comportamento em si é a política correta, só que o plugin não o altera.`
        : `remarkProductBlock alterou o comportamento preexistente do link javascript: — sem plugin: ${semPlugin} | com plugin: ${comPlugin}`,
    };
  },
);

// --- Cenário 11 — contrabando de atributo extra -------------------------
await runScenario(
  '11-contrabando-atributo-extra-rejeitado-antes-da-ast',
  'Tentativa de contrabando de atributo/dado extra é rejeitada fail-closed; caminho de sucesso carrega só productId',
  async () => {
    const tentativas = [
      `:::product\nversion: 1\nproductId: ${VALID_UUID}\nname: Produto Fake\n:::`,
      `:::product\nversion: 1\nproductId: ${VALID_UUID}", "evil":"injected\n:::`,
    ];

    const rejeicoes = [];
    for (const input of tentativas) {
      let threw = false;
      let errorName = null;
      try {
        await compileArticleBody(input);
      } catch (error) {
        threw = true;
        errorName = error.name;
      }
      rejeicoes.push({ input, threw, errorName, failClosedOk: threw && errorName === 'ProductBlockSyntaxError' });
    }
    const algumaFalhaNoFailClosed = rejeicoes.some((r) => !r.failClosedOk);

    // Estrutura do caminho de sucesso — AST-only, plugin real, sem
    // renderização (mesma disciplina do spike original UXE-004).
    const validBlock = `:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`;
    const tree = remarkPluginAstOnly(validBlock);
    const elements = findMdxJsxFlowElements(tree);
    const astOk =
      elements.length === 1 &&
      elements[0].attributes.length === 1 &&
      elements[0].attributes[0].name === 'productId' &&
      elements[0].attributes[0].value === VALID_UUID;

    // Estrutura do caminho de sucesso — ponta a ponta, produção real
    // (compileArticleBody + renderização real), com o stub capturando
    // exatamente o que chega ao componente. Decisão 1: o stub nunca
    // interpreta/mascara — só registra, e aqui verificamos que o que
    // chegou é exatamente { productId } e nada mais.
    capturedProductBlockProps.length = 0;
    const MDXContent = await compileArticleBody(validBlock);
    renderProductionComposition(MDXContent);
    const captured = capturedProductBlockProps[0] ?? null;
    const renderOk =
      captured !== null && Object.keys(captured).length === 1 && captured.productId === VALID_UUID;

    const blocking = algumaFalhaNoFailClosed || !astOk || !renderOk;

    return {
      blocking,
      classification: blocking ? 'VIOLAÇÃO' : 'fail-closed-e-estrutura-confirmados',
      rejeicoes,
      astAttributes: elements[0]?.attributes ?? null,
      renderedCapturedProps: captured,
      detail: blocking
        ? `Achado bloqueador — rejeicoes: ${JSON.stringify(rejeicoes)}; astOk=${astOk}; renderOk=${renderOk}; captured=${JSON.stringify(captured)}`
        : `${tentativas.length} tentativa(s) de contrabando rejeitadas fail-closed (ProductBlockSyntaxError); caminho de sucesso carrega exatamente 1 atributo (productId) tanto na AST quanto no componente renderizado.`,
    };
  },
);

// --- Relatório -----------------------------------------------------------

console.log('--- Relatório completo (JSON) ---');
console.log(JSON.stringify(results, null, 2));

console.log('\n--- Resumo (cenários normativos 07–11) ---');
for (const r of results) {
  const mark = r.blocking ? '✗' : '✓';
  console.log(`${mark} ${r.id}: ${r.description} → classification=${r.classification}`);
}

const blockingResults = results.filter((r) => r.blocking);
console.log(`\n${results.length} cenário(s) executado(s); ${blockingResults.length} bloqueador(es).`);

if (blockingResults.length > 0) {
  console.error('\nBloqueador(es) encontrado(s) — ver "detail" de cada entrada acima. Esta tarefa NÃO corrige a implementação de produção nesta rodada; reportar para nova decisão arquitetural.');
  process.exitCode = 1;
} else {
  console.log(
    '\nTodos os 5 cenários normativos (07–11) confirmaram, contra a implementação de produção real ' +
      '(compileArticleBody + remarkProductBlock + @commerce-platform/editorial, sem mocks), o mesmo resultado ' +
      'já registrado no Editorial Serialization Contract §7: nenhuma superfície de injeção nova identificada.',
  );
  process.exitCode = 0;
}
