#!/usr/bin/env node
/**
 * spikes/lexical-editorial/round-trip.mjs
 *
 * UXE-001 — Setup isolado do spike Lexical.
 *
 * Prova mínima exigida pelo critério de aceite da UXE-001: um ambiente
 * isolado reproduz um documento Lexical básico e o serializa/desserializa
 * via `@lexical/markdown`.
 *
 *   fixture.md → $convertFromMarkdownString → estado Lexical
 *              → $convertToMarkdownString   → Markdown serializado
 *
 * Escopo deliberadamente mínimo (decisão registrada, não reabrir sem nova
 * aprovação):
 *   - Só os transformers que a fixture básica exige: HEADING, UNORDERED_LIST,
 *     LINK, BOLD_STAR, ITALIC_STAR — não o conjunto completo `TRANSFORMERS`
 *     do @lexical/markdown, e sem QUOTE/CODE/TABLE.
 *   - Nenhuma sintaxe de bloco Produto/Oferta, nenhum corpus real de
 *     `bodyMdx`, nenhuma integração com apps/admin — isso é UXE-002/003+.
 *
 * Determinismo: a importação do Markdown roda dentro de
 * `editor.update(fn, { discrete: true })` — a opção suportada pelo próprio
 * Lexical (`EditorUpdateOptions.discrete`, ver `lexical/src/LexicalEditor.ts`
 * e `LexicalUpdates.ts` no pacote real) para forçar reconciliação síncrona
 * antes do `update()` retornar. A leitura/serialização de volta só ocorre
 * depois que essa chamada já retornou — não depende de timing do event
 * loop.
 *
 * Critério de sucesso: o ciclo completo roda sem erro E as 5 construções
 * básicas da fixture (heading, negrito, itálico, lista, link) são
 * identificáveis na serialização de saída, verificadas por checagens
 * pontuais de sintaxe Markdown (marcador + conteúdo), não por um parser
 * Markdown novo. Igualdade byte-a-byte com o input é só OBSERVADA
 * (`byte-identical: true|false`) — nunca um critério de PASS/FAIL, e nunca
 * fabricada por normalização prévia. A investigação formal de fidelidade de
 * conteúdo real é escopo da UXE-002, não deste spike.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeadlessEditor } from '@lexical/headless';
import { HeadingNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  HEADING,
  UNORDERED_LIST,
  LINK,
  BOLD_STAR,
  ITALIC_STAR,
} from '@lexical/markdown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixture.md');

// Só os transformers que a fixture básica exige — não o array `TRANSFORMERS`
// completo do @lexical/markdown (que inclui QUOTE, CODE, TABLE etc., fora
// do escopo mínimo desta tarefa).
const TRANSFORMERS = [HEADING, UNORDERED_LIST, LINK, BOLD_STAR, ITALIC_STAR];

const inputMarkdown = readFileSync(FIXTURE_PATH, 'utf8');

const editor = createHeadlessEditor({
  namespace: 'lexical-editorial-spike',
  // Só os nodes que os transformers acima precisam. ParagraphNode/TextNode/
  // RootNode já vêm registrados por padrão pelo core do Lexical.
  nodes: [HeadingNode, ListNode, ListItemNode, LinkNode],
  onError: (error) => {
    throw error;
  },
});

// Importação determinística: `discrete: true` força a reconciliação síncrona
// antes deste `update()` retornar.
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

const byteIdentical = outputMarkdown === inputMarkdown;

// Verificações inequívocas por construção: checam a SINTAXE Markdown
// produzida (marcador + conteúdo), não apenas se uma palavra aparece em
// algum lugar do texto de saída. Não é um parser Markdown novo — são 5
// checagens pontuais, cada uma amarrada exatamente ao que a fixture contém.
const checks = {
  heading: /^#\s+Spike Lexical\s*$/m.test(outputMarkdown),
  bold: outputMarkdown.includes('**negrito**'),
  italic: /(?<!\*)\*itálico\*(?!\*)/.test(outputMarkdown),
  list:
    /^-\s+Item um\s*$/m.test(outputMarkdown) && /^-\s+Item dois\s*$/m.test(outputMarkdown),
  link: outputMarkdown.includes('[FastCompre](https://fastcompre.com.br)'),
};

console.log('--- Input (fixture.md) ---');
console.log(inputMarkdown);
console.log('--- Output (round-trip via @lexical/markdown) ---');
console.log(outputMarkdown);
console.log('--- Observação de igualdade textual (não é critério de PASS/FAIL) ---');
console.log(`byte-identical: ${byteIdentical}`);
if (!byteIdentical) {
  console.log(
    'Divergência textual detectada — não normalizada, não fabricada. Ver input/output acima. ' +
      'A investigação formal de fidelidade de conteúdo real é escopo da UXE-002, não deste spike.',
  );
}

console.log('--- Verificações por construção (sintaxe, não parser novo) ---');
for (const [name, passed] of Object.entries(checks)) {
  console.log(`${passed ? 'OK  ' : 'FAIL'}  ${name}`);
}

const allConstructionsPreserved = Object.values(checks).every(Boolean);
if (!allConstructionsPreserved) {
  console.error(
    '\nUma ou mais construções básicas não foram identificadas na serialização de saída.',
  );
  process.exitCode = 1;
} else {
  console.log(
    '\nAs 5 construções básicas (heading, negrito, itálico, lista, link) foram identificadas ' +
      'na serialização round-trip.',
  );
}
