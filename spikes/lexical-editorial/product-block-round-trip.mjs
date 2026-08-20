#!/usr/bin/env node
/**
 * spikes/lexical-editorial/product-block-round-trip.mjs
 *
 * UXE-003 — Sintaxe customizada versionável + transformers Lexical.
 *
 * Prova dedicada ao bloco `:::product` (não estende `compare-corpus.mjs`
 * da UXE-002, por decisão fechada no desenho). Roda 11 cenários
 * determinísticos contra `PRODUCT_BLOCK`/`ProductBlockNode`:
 *
 *   - 2 cenários positivos (bloco válido isolado; bloco válido cercado por
 *     Markdown comum) — round-trip íntegro e prova de que o estado
 *     editorial do node contém somente `productId`.
 *   - 1 cenário de controle (opener indentado) — prova que a sintaxe
 *     customizada NUNCA intercepta texto que não casa exatamente com o
 *     opener; permanece Markdown comum, sem erro.
 *   - 8 cenários negativos — cada um prova que, uma vez que o opener exato
 *     `:::product` foi reconhecido, qualquer desvio da gramática v1 lança
 *     `ProductBlockSyntaxError` de forma explícita e determinística, nunca
 *     um fallback silencioso para texto.
 *
 * Diferente de `compare-corpus.mjs` (UXE-002), cujo papel é só
 * diagnóstico, este runner tem um critério de PASS/FAIL real por cenário —
 * é exatamente isso que a prova precisa demonstrar. Mesmo assim, nunca
 * para no primeiro cenário que falha: todos os 11 rodam sempre, cada um no
 * seu próprio try/catch, e o relatório final lista todos os resultados.
 *
 * `round-trip.mjs`, `compare-corpus.mjs` e os corpora da UXE-002
 * permanecem intocados por este arquivo.
 */

import { createHeadlessEditor } from '@lexical/headless';
import { $getRoot, $isElementNode } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import {
  PRODUCT_BLOCK,
  ProductBlockNode,
  ProductBlockSyntaxError,
  $isProductBlockNode,
} from './product-block-transformer.mjs';

const TRANSFORMERS = [PRODUCT_BLOCK];

// Chaves de estado editorial explicitamente proibidas no node — nenhuma
// delas pode aparecer sob a chave `$` (NODE_STATE_KEY) do JSON serializado,
// que é onde o Lexical namespacia estado customizado de node
// (confirmado por leitura direta de LexicalNodeState.ts/LexicalConstants.ts:
// `NODE_STATE_KEY = '$'`). Note que `$.productId` é o único estado de
// domínio esperado; `version` como propriedade top-level do JSON
// (`json.version === 1`) é o versionamento interno do próprio Lexical,
// não relacionado à sintaxe Markdown — não é checado aqui como proibido.
const FORBIDDEN_STATE_KEYS = ['name', 'price', 'link', 'offerId', 'markdownSyntaxVersion', 'version'];

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function attemptImport(inputMarkdown) {
  const editor = createHeadlessEditor({
    namespace: 'lexical-editorial-product-block-round-trip',
    nodes: [ProductBlockNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      $convertFromMarkdownString(inputMarkdown, TRANSFORMERS);
    },
    { discrete: true },
  );

  return editor;
}

// Percorre a árvore a partir da raiz via API pública do Lexical
// (`getChildren()`), sem depender de estruturas internas — os blocos de
// Produto nesta prova são sempre filhos diretos da raiz, mas a busca é
// recursiva por robustez.
function $collectProductBlockNodesRecursive(node, found) {
  if ($isProductBlockNode(node)) {
    found.push(node.exportJSON());
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectProductBlockNodesRecursive(child, found);
    }
  }
}

function collectProductBlockNodes(editor) {
  const found = [];
  editor.getEditorState().read(() => {
    $collectProductBlockNodesRecursive($getRoot(), found);
  });
  return found;
}

function exportMarkdown(editor) {
  let output = null;
  editor.getEditorState().read(() => {
    output = $convertToMarkdownString(TRANSFORMERS);
  });
  return output;
}

const SCENARIOS = [
  {
    name: 'bloco-valido-isolado',
    kind: 'positive',
    input: `:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`,
    expectByteIdentical: true,
  },
  {
    name: 'bloco-valido-cercado-por-markdown-comum',
    kind: 'positive',
    input: `Texto antes do bloco.\n\n:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::\n\nTexto depois do bloco.`,
    expectByteIdentical: false, // não é o foco deste cenário; só observado e reportado, nunca critério isolado.
  },
  {
    name: 'opener-indentado-continua-markdown-comum',
    kind: 'control',
    input: `  :::product\n  version: 1\n  productId: ${VALID_UUID}\n  :::`,
  },
  {
    name: 'version-ausente',
    kind: 'negative',
    input: `:::product\nproductId: ${VALID_UUID}\n:::`,
  },
  {
    name: 'version-desconhecida',
    kind: 'negative',
    input: `:::product\nversion: 2\nproductId: ${VALID_UUID}\n:::`,
  },
  {
    name: 'productId-ausente',
    kind: 'negative',
    input: `:::product\nversion: 1\n:::`,
  },
  {
    name: 'productId-uuid-invalido',
    kind: 'negative',
    input: `:::product\nversion: 1\nproductId: nao-e-um-uuid\n:::`,
  },
  {
    name: 'campo-linha-extra',
    kind: 'negative',
    input: `:::product\nversion: 1\nproductId: ${VALID_UUID}\nname: Produto X\n:::`,
  },
  {
    name: 'campo-duplicado',
    kind: 'negative',
    input: `:::product\nversion: 1\nproductId: ${VALID_UUID}\nproductId: ${VALID_UUID}\n:::`,
  },
  {
    name: 'ordem-invalida',
    kind: 'negative',
    input: `:::product\nproductId: ${VALID_UUID}\nversion: 1\n:::`,
  },
  {
    name: 'bloco-sem-fechamento',
    kind: 'negative',
    input: `:::product\nversion: 1\nproductId: ${VALID_UUID}`,
  },
];

function runPositiveOrControl(scenario) {
  const editor = attemptImport(scenario.input);
  const productBlockJsons = collectProductBlockNodes(editor);
  const outputMarkdown = exportMarkdown(editor);

  if (scenario.kind === 'control') {
    const pass = productBlockJsons.length === 0;
    return {
      scenario: scenario.name,
      kind: scenario.kind,
      pass,
      detail: pass
        ? 'Opener indentado corretamente NÃO reconhecido como sintaxe customizada; nenhum ProductBlockNode criado.'
        : `Falha: opener indentado deveria permanecer Markdown comum, mas ${productBlockJsons.length} ProductBlockNode(s) foram criados.`,
      productBlockJsons,
      outputMarkdown,
    };
  }

  // positive
  const stateKeysByNode = productBlockJsons.map((json) => Object.keys(json.$ ?? {}));
  const exactlyOneNode = productBlockJsons.length === 1;
  const stateHasOnlyProductId =
    exactlyOneNode &&
    stateKeysByNode[0].length === 1 &&
    stateKeysByNode[0][0] === 'productId';
  const noForbiddenKeys =
    exactlyOneNode &&
    FORBIDDEN_STATE_KEYS.every((key) => !(key in (productBlockJsons[0].$ ?? {})));
  const productIdMatches =
    exactlyOneNode && productBlockJsons[0].$ && productBlockJsons[0].$.productId === VALID_UUID;
  const byteIdentical = outputMarkdown === scenario.input;
  const byteIdenticalOk = !scenario.expectByteIdentical || byteIdentical;

  const pass = exactlyOneNode && stateHasOnlyProductId && noForbiddenKeys && productIdMatches && byteIdenticalOk;

  return {
    scenario: scenario.name,
    kind: scenario.kind,
    pass,
    detail: pass
      ? 'Bloco importado com sucesso; exatamente 1 ProductBlockNode; estado editorial contém somente productId; nenhuma chave proibida presente.'
      : [
          !exactlyOneNode && `esperado exatamente 1 ProductBlockNode, encontrado ${productBlockJsons.length}`,
          exactlyOneNode && !stateHasOnlyProductId && `estado do node não é exatamente ["productId"]: ${JSON.stringify(stateKeysByNode[0])}`,
          exactlyOneNode && !noForbiddenKeys && 'chave proibida encontrada no estado do node',
          exactlyOneNode && !productIdMatches && 'productId armazenado não corresponde ao productId da entrada',
          scenario.expectByteIdentical && !byteIdentical && 'round-trip não é byte-idêntico ao input',
        ]
          .filter(Boolean)
          .join('; '),
    stateKeys: exactlyOneNode ? stateKeysByNode[0] : stateKeysByNode,
    productBlockJsons,
    outputMarkdown,
    byteIdentical,
  };
}

function runNegative(scenario) {
  try {
    const editor = attemptImport(scenario.input);
    // Se chegou aqui, a importação NÃO lançou — falha para um cenário
    // negativo, independentemente do que foi produzido.
    const productBlockJsons = collectProductBlockNodes(editor);
    return {
      scenario: scenario.name,
      kind: scenario.kind,
      pass: false,
      detail: `Falha: a importação deveria lançar ProductBlockSyntaxError, mas completou sem erro (${productBlockJsons.length} ProductBlockNode(s) criados) — indício de fallback silencioso.`,
      thrown: null,
    };
  } catch (error) {
    const isExpectedErrorType = error instanceof ProductBlockSyntaxError;
    return {
      scenario: scenario.name,
      kind: scenario.kind,
      pass: isExpectedErrorType,
      detail: isExpectedErrorType
        ? `Erro explícito lançado corretamente: ${error.message}`
        : `Falha: lançou um erro, mas não é ProductBlockSyntaxError (${error.constructor.name}): ${error.message}`,
      thrown: { name: error.name, message: error.message },
    };
  }
}

const report = [];
for (const scenario of SCENARIOS) {
  try {
    if (scenario.kind === 'negative') {
      report.push(runNegative(scenario));
    } else {
      report.push(runPositiveOrControl(scenario));
    }
  } catch (error) {
    // Falha técnica inesperada mesmo em cenário positivo/controle —
    // nunca interrompe os demais cenários.
    report.push({
      scenario: scenario.name,
      kind: scenario.kind,
      pass: false,
      detail: `Erro técnico inesperado durante o cenário: ${error.message}`,
      thrown: { name: error.name, message: error.message },
    });
  }
}

console.log('--- Relatório completo (JSON) ---');
console.log(JSON.stringify(report, null, 2));

console.log('\n--- Resumo ---');
let failCount = 0;
for (const entry of report) {
  console.log(`${entry.scenario}  [${entry.kind}]  →  pass=${entry.pass}  ${entry.detail}`);
  if (!entry.pass) {
    failCount += 1;
  }
}
console.log(`\n${report.length} cenário(s) executado(s); ${failCount} falharam.`);

process.exitCode = failCount > 0 ? 1 : 0;
