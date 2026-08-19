#!/usr/bin/env node
/**
 * spikes/lexical-editorial/compare-corpus.mjs
 *
 * UXE-002 — Round-trip 1: `bodyMdx` existente → Lexical → `bodyMdx`.
 *
 * Roda o mesmo ciclo determinístico já provado em `round-trip.mjs` (UXE-001)
 * — createHeadlessEditor + editor.update(fn, { discrete: true }) — mas
 * iterando sobre dois corpora versionados em `corpus/`:
 *
 *   - corpus/persisted-current/            os 3 `bodyMdx` reais hoje
 *     persistidos no banco de dev, congelados via consulta somente-leitura
 *     (ver corpus/persisted-current/MANIFEST.md). Nenhuma conexão com banco
 *     em tempo de execução deste script.
 *   - corpus/representative-common-markdown/  fixtures controladas/
 *     sintéticas, cobrindo construções de Markdown comum que o pipeline
 *     público aceita e que o produto precisa preservar. É um corpus
 *     sintético porque o projeto ainda não possui histórico editorial real
 *     suficientemente rico para cobrir essas construções sozinho — ver
 *     README.md.
 *
 * Escopo fechado (decisão registrada na UXE-002, não reabrir sem nova
 * aprovação):
 *   - Só transformers/nodes oficiais: HEADING, QUOTE, UNORDERED_LIST,
 *     ORDERED_LIST, LINK, BOLD_STAR, ITALIC_STAR, INLINE_CODE, CODE.
 *   - Nenhum node/transformer customizado.
 *   - Horizontal rule e imagem Markdown são gaps documentados (sem
 *     transformer oficial de round-trip em @lexical/markdown@0.49.0) —
 *     não implementados aqui, ver README.md. Se aparecerem em algum
 *     arquivo do corpus, são reportados como `unsupported`, nunca
 *     silenciosamente ignorados.
 *   - Nenhuma sintaxe de bloco Produto/Oferta (UXE-003/UXE-004).
 *
 * Diferença de round-trip.mjs (UXE-001): processa N arquivos em vez de uma
 * fixture única; um erro isolado em um arquivo nunca interrompe a análise
 * dos demais (cada arquivo roda no seu próprio try/catch); produz um
 * relatório estruturado (JSON) além do resumo legível no console.
 *
 * Classificação (`formatting-only | semantic-loss | unsupported | error`)
 * é só diagnóstica — descreve o tipo de achado, nunca decide sozinha se ele
 * é aceitável. `needsDecision: true` em qualquer entrada com divergência,
 * inclusive as classificadas como `formatting-only` (ex.: ausência isolada
 * de newline final, já observada na UXE-001) — a aceitação é sempre uma
 * decisão humana, registrada fora deste script. Nenhuma normalização de
 * input/output é aplicada para fabricar igualdade.
 *
 * Código de saída: só reflete falha TÉCNICA de execução (classificação
 * `error` em pelo menos um arquivo). Divergências de conteúdo
 * (`formatting-only`, `semantic-loss`, `unsupported`) nunca alteram o
 * código de saída — decidir se são aceitáveis não é responsabilidade deste
 * script.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeadlessEditor } from '@lexical/headless';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { CodeNode } from '@lexical/code-core';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  LINK,
  BOLD_STAR,
  ITALIC_STAR,
  INLINE_CODE,
  CODE,
} from '@lexical/markdown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = path.join(__dirname, 'corpus');

// Só os corpora definidos na UXE-002 — a ordem de listagem é sempre
// alfabética por arquivo, para reprodutibilidade.
const CORPORA = ['persisted-current', 'representative-common-markdown'];

// Só os transformers oficiais aprovados no desenho técnico da UXE-002.
const TRANSFORMERS = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  LINK,
  BOLD_STAR,
  ITALIC_STAR,
  INLINE_CODE,
  CODE,
];

// Checagens pontuais por construção — mesma disciplina de round-trip.mjs
// (sintaxe + conteúdo, não um parser Markdown novo). Cada checagem só é
// exigida no output se a construção correspondente já estava presente no
// input do próprio arquivo.
const CONSTRUCTION_CHECKS = [
  { name: 'heading', regex: /^#{1,6}\s+\S/m },
  { name: 'blockquote', regex: /^>\s?\S/m },
  { name: 'unorderedList', regex: /^[ \t]*-\s+\S/m },
  { name: 'orderedList', regex: /^[ \t]*\d+\.\s+\S/m },
  // Checagem mínima e explícita, limitada ao que o corpus desta UXE-002
  // declara: presença de um item de lista INDENTADO (sublista aninhada
  // dentro de um item pai — caso de `03-lists.md`). Não é um parser
  // Markdown de profundidade de aninhamento genérico; é só a mesma
  // checagem de sintaxe pontual das demais construções, aplicada à
  // presença de indentação antes do marcador. Existe porque as checagens
  // `unorderedList`/`orderedList` acima só testam presença do marcador em
  // algum lugar do texto, não a hierarquia — por isso não detectavam,
  // sozinhas, o achatamento de sublista encontrado na execução anterior.
  { name: 'nestedList', regex: /^[ \t]+(?:-|\d+\.)\s+\S/m },
  { name: 'bold', regex: /\*\*[^*]+\*\*/ },
  { name: 'italic', regex: /(?<!\*)\*[^*\n]+\*(?!\*)/ },
  { name: 'link', regex: /\[[^\]]+\]\([^)]+\)/ },
  { name: 'inlineCode', regex: /`[^`\n]+`/ },
  { name: 'fencedCode', regex: /^```/m },
];

// Construções que o pipeline público aceita mas que NÃO têm transformer
// oficial de round-trip em @lexical/markdown@0.49.0 (gaps documentados no
// README — horizontal rule e imagem). Presença disso em qualquer arquivo do
// corpus é reportada como `unsupported`, nunca ignorada silenciosamente.
const UNSUPPORTED_PATTERNS = [
  { name: 'image', regex: /!\[[^\]]*\]\([^)]+\)/ },
  { name: 'horizontalRule', regex: /^(?:-{3,}|\*{3,}|_{3,})\s*$/m },
];

function runRoundTrip(inputMarkdown) {
  const editor = createHeadlessEditor({
    namespace: 'lexical-editorial-compare-corpus',
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode],
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

  let outputMarkdown = null;
  editor.getEditorState().read(() => {
    outputMarkdown = $convertToMarkdownString(TRANSFORMERS);
  });

  if (outputMarkdown === null) {
    throw new Error('Falha ao ler o estado do editor após a importação — round-trip incompleto.');
  }

  return outputMarkdown;
}

function analyzeFile(corpus, fileName, inputMarkdown) {
  const relativePath = `corpus/${corpus}/${fileName}`;

  const unsupportedFound = UNSUPPORTED_PATTERNS.filter((p) => p.regex.test(inputMarkdown)).map(
    (p) => p.name,
  );

  let outputMarkdown;
  try {
    outputMarkdown = runRoundTrip(inputMarkdown);
  } catch (error) {
    return {
      file: relativePath,
      corpus,
      byteIdentical: null,
      expectedConstructions: {},
      unsupportedConstructsFound: unsupportedFound,
      divergence: { description: `Erro técnico durante o round-trip: ${error.message}` },
      classification: 'error',
      needsDecision: true,
      knownCandidateMatch: false,
    };
  }

  const byteIdentical = outputMarkdown === inputMarkdown;

  const expectedConstructions = {};
  const missingConstructions = [];
  for (const check of CONSTRUCTION_CHECKS) {
    if (check.regex.test(inputMarkdown)) {
      const preserved = check.regex.test(outputMarkdown);
      expectedConstructions[check.name] = preserved;
      if (!preserved) {
        missingConstructions.push(check.name);
      }
    }
  }

  const onlyTrailingNewlineDiff =
    !byteIdentical &&
    (`${inputMarkdown}\n` === outputMarkdown || `${outputMarkdown}\n` === inputMarkdown);

  let classification = null;
  if (unsupportedFound.length > 0) {
    classification = 'unsupported';
  } else if (missingConstructions.length > 0) {
    classification = 'semantic-loss';
  } else if (!byteIdentical) {
    classification = 'formatting-only';
  }

  const needsDecision = classification !== null;

  const divergence = byteIdentical
    ? null
    : {
        description: onlyTrailingNewlineDiff
          ? 'Única divergência: ausência/presença de newline final (padrão já observado na UXE-001).'
          : missingConstructions.length > 0
            ? `Construção(ões) não preservada(s): ${missingConstructions.join(', ')}.`
            : 'Divergência textual sem perda de construção identificada pelas checagens pontuais.',
        input: inputMarkdown,
        output: outputMarkdown,
      };

  return {
    file: relativePath,
    corpus,
    byteIdentical,
    expectedConstructions,
    unsupportedConstructsFound: unsupportedFound,
    divergence,
    classification,
    needsDecision,
    knownCandidateMatch: onlyTrailingNewlineDiff,
  };
}

const report = [];

for (const corpus of CORPORA) {
  const corpusDir = path.join(CORPUS_ROOT, corpus);
  const files = readdirSync(corpusDir)
    .filter((f) => f.endsWith('.md') && f !== 'MANIFEST.md')
    .sort();

  for (const fileName of files) {
    const filePath = path.join(corpusDir, fileName);
    let inputMarkdown;
    try {
      inputMarkdown = readFileSync(filePath, 'utf8');
    } catch (error) {
      report.push({
        file: `corpus/${corpus}/${fileName}`,
        corpus,
        byteIdentical: null,
        expectedConstructions: {},
        unsupportedConstructsFound: [],
        divergence: { description: `Erro técnico ao ler o arquivo: ${error.message}` },
        classification: 'error',
        needsDecision: true,
        knownCandidateMatch: false,
      });
      continue;
    }
    report.push(analyzeFile(corpus, fileName, inputMarkdown));
  }
}

console.log('--- Relatório completo (JSON) ---');
console.log(JSON.stringify(report, null, 2));

console.log('\n--- Resumo ---');
let errorCount = 0;
let needsDecisionCount = 0;
for (const entry of report) {
  const status = entry.classification ?? 'sem-divergencia';
  console.log(`${entry.file}  →  byteIdentical=${entry.byteIdentical}  classification=${status}`);
  if (entry.classification === 'error') {
    errorCount += 1;
  }
  if (entry.needsDecision) {
    needsDecisionCount += 1;
  }
}
console.log(
  `\n${report.length} arquivo(s) processado(s); ${needsDecisionCount} com achado pendente de decisão; ${errorCount} com erro técnico.`,
);

// Código de saída só reflete falha TÉCNICA de execução — divergências de
// conteúdo (formatting-only/semantic-loss/unsupported) nunca decidem
// PASS/FAIL sozinhas; isso é decisão humana, fora deste script.
process.exitCode = errorCount > 0 ? 1 : 0;
