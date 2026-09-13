/**
 * spikes/lexical-editorial/uxe-019-regression-real-articles-proof.mjs
 *
 * UXE-019 — Regressão: artigos publicados existentes sem blocos novos.
 *
 * Objetivo (UX-Implementation-Backlog.md): provar que `bodyMdx` de Artigos
 * que NUNCA usaram o bloco `:::product` (a amostra de Artigos existentes
 * preservada no corpus) continua renderizando, na composição pública real,
 * exatamente como antes da introdução do plugin `remarkProductBlock`
 * (UXE-017) — nenhuma regressão visual/estrutural para conteúdo que não usa
 * a nova sintaxe.
 *
 * Por que fora do Jest, como as provas da UXE-017/UXE-018: a mesma
 * limitação já documentada nesses dois scripts — `next/jest` não
 * transforma pacotes ESM puros de `node_modules` (`@mdx-js/mdx`,
 * `unist-util-visit`), então nenhum teste Jest roda `evaluate()` real.
 * Esta prova roda inteiramente fora do Jest, via
 * `node --experimental-strip-types`, reutilizando sem modificação o mesmo
 * `ts-extension-resolve-loader.mjs` já aprovado na UXE-018 (necessário
 * porque `compile-article-body.ts` importa `./product-block-remark-plugin`
 * sem extensão — resolução "bundler" do TypeScript, não nativa do Node).
 *
 * Desenho aprovado (decisões fechadas na revisão da UXE-019, todas
 * vinculantes para este arquivo):
 *
 * 1. Amostra do critério de aceite literal ("Artigos publicados reais"):
 *    somente os arquivos de `corpus/persisted-current/` cujo
 *    `MANIFEST.md` registra `status: PUBLISHED` (hoje, 2 arquivos). O
 *    terceiro artigo real do mesmo corpus, registrado como `DRAFT`, e os
 *    8 arquivos de `corpus/representative-common-markdown/` são cobertura
 *    complementar — nunca substituem a evidência dos 2 artigos publicados
 *    reais. O status de cada arquivo é lido do próprio `MANIFEST.md`
 *    (nunca hardcoded aqui), para que uma mudança de status nesse arquivo
 *    fique visível na próxima execução desta prova em vez de divergir
 *    silenciosamente.
 * 2. Corpus reutilizado diretamente de `corpus/persisted-current/` e
 *    `corpus/representative-common-markdown/` (mesmos arquivos da UXE-002),
 *    lido por caminho relativo — nenhuma cópia/duplicação em
 *    `apps/fastcompre` ou em qualquer outro lugar.
 * 3. Prova standalone executável, não conectada a `.github/workflows/ci.yml`
 *    nesta tarefa — mesmo precedente das UXE-017/018. Uma eventual
 *    promoção a gate permanente de CI é decisão separada, fora do escopo
 *    desta tarefa.
 * 4. Nenhum script novo adicionado a `package.json` — este arquivo roda
 *    via invocação direta do Node (ver comando no rodapé deste cabeçalho),
 *    igual às provas da UXE-017/018.
 * 5. Caminho "antes": `evaluate(bodyMdx, { ...runtime, format: 'md' })`,
 *    SEM `remarkPlugins`. Esta é uma reconstrução metodológica, aprovada
 *    como baseline equivalente pré-plugin — não é, e não deve ser descrita
 *    como, código histórico da UXE-017 recuperado do Git (isso nunca foi
 *    verificado nesta investigação; a ferramenta de shell no dispositivo
 *    esteve indisponível). É, deliberadamente, a MESMA chamada de
 *    `compile-article-body.ts` (ver `compileArticleBody` abaixo, importado
 *    de produção) menos o único parâmetro que a UXE-017 adicionou.
 * 6. Caminho "depois": `compileArticleBody` real de produção (UXE-017,
 *    importado, não reimplementado). Ambos os lados são renderizados com
 *    `renderToStaticMarkup(MDXContent({ components: { h1: 'h2' } }))` —
 *    a MESMA composição de `page.tsx` (`<MDXContent components={{ h1:
 *    'h2' }} />`), chamada como função em vez de JSX porque
 *    `--experimental-strip-types` não transforma sintaxe JSX (mesma
 *    observação já registrada nas provas da UXE-017/018).
 * 7. Pré-condição validada ANTES de comparar: nenhum arquivo desta
 *    regressão pode conter a substring `:::product` — um artigo "sem
 *    blocos novos" que na verdade contivesse a sintaxe tornaria a
 *    comparação enganosa (o "antes" e o "depois" divergiriam por design,
 *    não por regressão). A checagem é uma substring simples (mais
 *    conservadora que o `OPENER_REGEXP` de produção, que só reconhece o
 *    opener em início de linha/parágrafo) — decisão deliberada para não
 *    depender de `@commerce-platform/editorial` (pacote não declarado
 *    como dependência de `spikes/lexical-editorial/package.json`, que
 *    esta tarefa não deve alterar) e para nunca deixar passar um falso
 *    negativo. Uma violação desta pré-condição interrompe a prova daquele
 *    arquivo com um erro explícito, nunca com uma comparação silenciosa.
 * 8. Comparação byte a byte da string HTML renderizada
 *    (`renderToStaticMarkup`) entre "antes" e "depois". Qualquer
 *    divergência é reportada e tratada como bloqueadora (código de saída
 *    não-zero) — nenhuma normalização/tolerância é introduzida aqui para
 *    fazer a prova passar.
 * 9. Fronteiras preservadas: este arquivo NÃO importa nem depende de
 *    `product-block.tsx`/`product-block-resolver.ts` (artefatos da
 *    UXE-018) — nenhum dos arquivos usados neste corpus contém
 *    `:::product` (ver decisão 7), então a resolução de Produto/Oferta da
 *    UXE-018 nunca é exercitada aqui, por design. Não testa segurança/
 *    injeção (escopo da UXE-020). Não altera `page.tsx`. Não antecipa
 *    UXW-011 nem UXE-021.
 *
 * Comando de execução (a partir de `spikes/lexical-editorial/`):
 *   node --experimental-strip-types \
 *     --experimental-loader ./ts-extension-resolve-loader.mjs \
 *     uxe-019-regression-real-articles-proof.mjs
 *
 * Código de saída: não-zero se (a) qualquer arquivo violar a pré-condição
 * do item 7, (b) qualquer erro técnico ocorrer durante compilação/
 * renderização, (c) qualquer divergência byte a byte for encontrada, ou
 * (d) o bucket PUBLISHED (lido de MANIFEST.md) estiver vazio — sem isso, a
 * prova poderia passar em verde sem nunca ter exercido a amostra
 * obrigatória do critério de aceite. Todos tratados como bloqueadores
 * nesta tarefa (decisão 8), diferente do precedente diagnóstico de
 * `compare-corpus.mjs` (UXE-002), onde divergência de conteúdo nunca
 * decidia o código de saída sozinha.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileArticleBody } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = path.join(__dirname, 'corpus');
const PERSISTED_CURRENT_DIR = path.join(CORPUS_ROOT, 'persisted-current');
const SYNTHETIC_DIR = path.join(CORPUS_ROOT, 'representative-common-markdown');
const MANIFEST_PATH = path.join(PERSISTED_CURRENT_DIR, 'MANIFEST.md');

// Guarda de pré-condição (decisão 7) — checagem deliberadamente simples e
// conservadora, ver racional completo no cabeçalho deste arquivo.
const PRODUCT_BLOCK_MARKER = ':::product';

/**
 * Caminho "antes" — baseline equivalente pré-plugin (decisão 5). MESMA
 * chamada de `compile-article-body.ts`, sem `remarkPlugins`.
 */
async function compileBaselinePrePlugin(bodyMdx) {
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
  });
  return MDXContent;
}

/**
 * Mesma composição relevante de produção de `page.tsx`
 * (`<MDXContent components={{ h1: 'h2' }} />`), chamada como função —
 * ver decisão 6.
 */
function renderProductionComposition(MDXContent) {
  return renderToStaticMarkup(MDXContent({ components: { h1: 'h2' } }));
}

/**
 * Lê `MANIFEST.md` e devolve um Map arquivo → status, usando a mesma
 * tabela já usada como evidência de proveniência desde a UXE-002. Nenhum
 * status é hardcoded fora deste parse — ver decisão 1.
 */
function parsePersistedCurrentManifest(manifestContent) {
  const rowRegex = /^\|\s*`([^`]+)`\s*\|\s*`[^`]*`\s*\|\s*`[^`]*`\s*\|\s*`([^`]+)`\s*\|\s*\d+\s*\|$/gm;
  const statusByFile = new Map();
  let match;
  while ((match = rowRegex.exec(manifestContent)) !== null) {
    statusByFile.set(match[1], match[2]);
  }
  return statusByFile;
}

function listMarkdownFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'MANIFEST.md')
    .sort();
}

/**
 * Roda a prova completa (pré-condição + antes + depois + comparação byte
 * a byte) para um único arquivo. Nunca lança para fora — um erro (técnico
 * ou de pré-condição) vira uma entrada `classification: 'error'` no
 * relatório, para que um arquivo isolado nunca interrompa os demais (mesma
 * disciplina de `compare-corpus.mjs`, UXE-002).
 */
async function proveFile(relativePath, bodyMdx) {
  try {
    if (bodyMdx.includes(PRODUCT_BLOCK_MARKER)) {
      throw new Error(
        `Pré-condição violada: o arquivo contém "${PRODUCT_BLOCK_MARKER}" — não é elegível para esta ` +
          'regressão de "artigos sem blocos novos" sem uma nova decisão (a comparação "antes"/"depois" ' +
          'divergiria por design, não por regressão).',
      );
    }

    const beforeMDXContent = await compileBaselinePrePlugin(bodyMdx);
    const afterMDXContent = await compileArticleBody(bodyMdx);

    const beforeHtml = renderProductionComposition(beforeMDXContent);
    const afterHtml = renderProductionComposition(afterMDXContent);

    const byteIdentical = beforeHtml === afterHtml;

    return {
      file: relativePath,
      classification: byteIdentical ? null : 'divergence',
      byteIdentical,
      beforeLength: beforeHtml.length,
      afterLength: afterHtml.length,
      divergence: byteIdentical ? null : { before: beforeHtml, after: afterHtml },
    };
  } catch (error) {
    return {
      file: relativePath,
      classification: 'error',
      byteIdentical: null,
      beforeLength: null,
      afterLength: null,
      divergence: { description: `Erro técnico: ${error.message}` },
    };
  }
}

async function buildReport() {
  const manifestContent = readFileSync(MANIFEST_PATH, 'utf8');
  const statusByFile = parsePersistedCurrentManifest(manifestContent);

  const published = [];
  const draft = [];
  const otherStatus = [];

  for (const fileName of listMarkdownFiles(PERSISTED_CURRENT_DIR)) {
    const relativePath = `corpus/persisted-current/${fileName}`;
    const status = statusByFile.get(fileName);
    const bodyMdx = readFileSync(path.join(PERSISTED_CURRENT_DIR, fileName), 'utf8');
    const result = await proveFile(relativePath, bodyMdx);

    if (status === 'PUBLISHED') {
      published.push(result);
    } else if (status === 'DRAFT') {
      draft.push(result);
    } else {
      // Status inesperado (nem PUBLISHED, nem DRAFT) — nunca bucketizar
      // silenciosamente; falha explícita para revisão humana (decisão 1
      // exige que o bucket do critério de aceite venha só de status
      // PUBLISHED confirmado).
      otherStatus.push({
        ...result,
        classification: 'error',
        divergence: {
          description: `Status "${status ?? 'ausente'}" não reconhecido em MANIFEST.md para "${fileName}" — nem PUBLISHED nem DRAFT.`,
        },
      });
    }
  }

  const synthetic = [];
  for (const fileName of listMarkdownFiles(SYNTHETIC_DIR)) {
    const relativePath = `corpus/representative-common-markdown/${fileName}`;
    const bodyMdx = readFileSync(path.join(SYNTHETIC_DIR, fileName), 'utf8');
    synthetic.push(await proveFile(relativePath, bodyMdx));
  }

  return { published, draft, otherStatus, synthetic };
}

function printBucket(title, entries) {
  console.log(`\n--- ${title} ---`);
  if (entries.length === 0) {
    console.log('(nenhum arquivo)');
    return;
  }
  for (const entry of entries) {
    const status = entry.classification ?? 'identico';
    const mark = entry.classification ? '✗' : '✓';
    console.log(`${mark} ${entry.file}  →  byteIdentical=${entry.byteIdentical}  classification=${status}`);
  }
}

async function main() {
  const { published, draft, otherStatus, synthetic } = await buildReport();

  console.log('--- Relatório completo (JSON) ---');
  console.log(JSON.stringify({ published, draft, otherStatus, synthetic }, null, 2));

  printBucket('Artigos PUBLISHED reais (critério de aceite)', published);
  printBucket('Artigo DRAFT real (cobertura complementar)', draft);
  if (otherStatus.length > 0) {
    printBucket('Status inesperado em MANIFEST.md (erro)', otherStatus);
  }
  printBucket('Corpus sintético representative-common-markdown (cobertura complementar)', synthetic);

  const allEntries = [...published, ...draft, ...otherStatus, ...synthetic];
  const blocking = allEntries.filter((e) => e.classification === 'error' || e.byteIdentical === false);
  const totalCount = allEntries.length;
  // Gate adicional (revisão pós-implementação da UXE-019): um bucket
  // `published` vazio não pode passar em silêncio — sem pelo menos um
  // arquivo classificado como PUBLISHED em MANIFEST.md, a amostra
  // obrigatória do critério de aceite ("Artigos publicados reais") nunca
  // foi exercida por esta execução, mesmo que todas as demais entradas
  // (DRAFT/sintéticas) estejam idênticas. O status continua vindo só de
  // MANIFEST.md — nenhum nome de arquivo é hardcoded aqui.
  const criterionSampleEmpty = published.length === 0;

  console.log('\n--- Resumo ---');
  console.log(`${totalCount} arquivo(s) processado(s); ${blocking.length} bloqueador(es).`);
  console.log(
    `Amostra do critério de aceite (PUBLISHED): ${published.length} arquivo(s), ` +
      `${published.filter((e) => e.byteIdentical === true).length} idêntico(s) byte a byte.`,
  );

  if (criterionSampleEmpty) {
    console.error(
      '\nBloqueador: nenhuma entrada classificada como PUBLISHED em MANIFEST.md — a amostra ' +
        'obrigatória do critério de aceite ("Artigos publicados reais") não foi exercida por esta execução.',
    );
  }

  if (blocking.length > 0 || criterionSampleEmpty) {
    console.error('\nBloqueador(es) encontrado(s) — ver "divergence" de cada entrada acima para detalhes.');
    process.exitCode = 1;
    return;
  }

  console.log(
    '\nTodas as comparações passaram — nenhuma regressão encontrada para artigos sem blocos ' +
      '`:::product` (baseline pré-plugin idêntico, byte a byte, à composição pública real com o ' +
      'pipeline de produção da UXE-017).',
  );
  process.exitCode = 0;
}

main().catch((error) => {
  console.error('Erro inesperado ao rodar a prova:', error);
  process.exit(1);
});
