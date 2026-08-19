#!/usr/bin/env node
/**
 * scripts/measure-performance-baseline.mjs
 *
 * UXF-013 — Baseline mensurável de performance do FastCompre (estado atual).
 *
 * Mede LCP, CLS, TBT e TTFB (Lighthouse, navigation mode, preset mobile,
 * build de produção real) nas 3 rotas públicas existentes do FastCompre —
 * `/`, `/[categorySlug]`, `/[categorySlug]/[articleSlug]` — e, opcionalmente,
 * INP de campo via CrUX. Esta tarefa só MEDE: nenhuma otimização, nenhum
 * budget, nenhum gate de CI. O script termina com exit code != 0 apenas
 * quando a coleta em si falha (rota indisponível, Lighthouse não conseguiu
 * completar as 5 execuções por rota) — nunca por causa de um valor medido
 * ser "ruim".
 *
 * Decisões congeladas (revisão final da UXF-013, não reabrir sem nova
 * aprovação):
 *
 *   - Preset: só mobile. Nenhuma medição desktop nesta tarefa.
 *   - 5 execuções BEM-SUCEDIDAS por rota, sequenciais (nunca concorrentes).
 *     Cada uma das 5 pode ter 1 retry em caso de falha operacional (crash
 *     do Chrome, timeout). Se, mesmo após o retry, uma das 5 não for obtida,
 *     a rota inteira vira "insufficient-data" — nunca se agrega 3/5 ou 4/5
 *     como baseline oficial.
 *   - Agregação: mediana individual de cada métrica (nunca "median-run").
 *   - TTFB: leitura fixa de `audits['server-response-time'].numericValue`,
 *     o audit real do Lighthouse 13.4.1 (confirmado lendo o código-fonte
 *     do pacote instalado, não por suposição). Se essa chave não existir
 *     ou não for numérica, o script FALHA explicitamente — nunca tenta
 *     nomes alternativos silenciosamente, para forçar revisão da
 *     metodologia se uma troca de versão do Lighthouse mudar o audit.
 *   - Throttling, form factor e comportamento de storage/cache NUNCA são
 *     redigitados manualmente aqui — são lidos de volta de
 *     `lhr.configSettings`, o objeto que o próprio Lighthouse devolve
 *     descrevendo a configuração efetivamente usada naquela execução.
 *     Isso evita duplicar (e divergir de) valores default do Lighthouse.
 *   - INP é campo, não laboratório — nunca "simulado" aqui. Consulta é
 *     OPT-IN: só ocorre com `--public-origin` + `CRUX_API_KEY` no
 *     ambiente. Sem isso, todo INP fica `status: "not requested"`.
 *     Quando solicitado: tenta primeiro a URL específica da rota; só cai
 *     para o nível de origem (`crux-origin`/`scope: "origin"`, nunca
 *     apresentado como específico da rota) quando a resposta da CrUX
 *     indicar de fato ausência de dado para aquela URL (404/sem p75) — um
 *     ERRO operacional (credencial inválida, quota, 5xx, rede) nunca é
 *     tratado como "sem dado": vira `status: "query-error"`, registrado
 *     separadamente, e nunca invalida a baseline Lighthouse da rota (INP é
 *     complementar). Toda consulta CrUX fixa `formFactor: 'PHONE'` — sem
 *     isso, a CrUX agrega todos os dispositivos, o que divergiria do
 *     recorte mobile fixado na medição de laboratório (Lighthouse). Isso
 *     fica registrado em `metadata.cruxFormFactor` para reprodução em
 *     UXQ-007.
 *   - `docs/performance/baseline-uxf-013.json` é a fonte canônica.
 *     `docs/performance/baseline-uxf-013.md` é gerado exclusivamente a
 *     partir do objeto JSON produzido nesta mesma execução — nunca contém
 *     texto/conteúdo independente.
 *
 * Pré-requisito (este script NÃO builda nem sobe nada sozinho — mesmo
 * princípio de scripts/verify-tailwind-cross-package-scan.mjs): build de
 * produção real da API e do FastCompre já rodando, com uma Categoria e um
 * Artigo publicados reais no banco (pré-condição operacional da UXF-013 —
 * ver roteiro de execução no desenho técnico aprovado).
 *
 * Uso:
 *   node scripts/measure-performance-baseline.mjs \
 *     --category-slug=<slug real> --article-slug=<slug real> \
 *     [--base-url=http://localhost:3002] \
 *     [--public-origin=https://fastcompre.com.br]   # opt-in de INP/CrUX
 *
 *   CRUX_API_KEY=<chave>  # obrigatório no ambiente se --public-origin for usado
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'performance');
const OUT_JSON = path.join(OUT_DIR, 'baseline-uxf-013.json');
const OUT_MD = path.join(OUT_DIR, 'baseline-uxf-013.md');

const RUNS_PER_ROUTE = 5;
const MAX_ATTEMPTS_PER_SLOT = 2; // tentativa inicial + 1 retry

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://localhost:3002',
    categorySlug: null,
    articleSlug: null,
    publicOrigin: null,
  };

  for (const raw of argv) {
    if (!raw.startsWith('--')) {
      throw new Error(`Argumento inesperado (esperado --chave=valor): "${raw}"`);
    }
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const value = eq === -1 ? '' : raw.slice(eq + 1);
    switch (key) {
      case 'base-url':
        args.baseUrl = value;
        break;
      case 'category-slug':
        args.categorySlug = value;
        break;
      case 'article-slug':
        args.articleSlug = value;
        break;
      case 'public-origin':
        args.publicOrigin = value;
        break;
      default:
        throw new Error(`Argumento desconhecido: --${key}`);
    }
  }

  if (!args.categorySlug || !args.articleSlug) {
    throw new Error(
      '--category-slug e --article-slug são obrigatórios. O script nunca escolhe ' +
        'uma Categoria/Artigo sozinho — informe slugs reais e já publicados no ambiente ' +
        'que está sendo medido (pré-condição operacional da UXF-013).',
    );
  }

  if (args.publicOrigin && !process.env.CRUX_API_KEY) {
    throw new Error(
      '--public-origin foi informado, mas a variável de ambiente CRUX_API_KEY não está ' +
        'definida. A consulta de INP/CrUX é opt-in por flag + credencial: se você quis ' +
        'pedir INP, defina CRUX_API_KEY; se não quis, remova --public-origin.',
    );
  }

  return args;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

function buildRoutes(args) {
  return [
    { key: '/', path: '/' },
    { key: '/[categorySlug]', path: `/${args.categorySlug}` },
    { key: '/[categorySlug]/[articleSlug]', path: `/${args.categorySlug}/${args.articleSlug}` },
  ];
}

function joinUrl(origin, routePath) {
  return new URL(routePath, origin).toString();
}

// ---------------------------------------------------------------------------
// Preflight — nunca escreve nada em disco; falha rápido e explícito.
// ---------------------------------------------------------------------------

async function preflightCheckRoute(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(
      `Rota inacessível: ${url} (${err.message}). Suba o build de produção real antes de ` +
        'medir (pnpm --filter fastcompre build && pnpm --filter fastcompre start; ' +
        'pnpm --filter api build && pnpm --filter api start).',
    );
  }
  if (res.status !== 200) {
    throw new Error(
      `Rota retornou HTTP ${res.status} (esperado 200): ${url}. Confirme que a Categoria/Artigo ` +
        'informados existem, estão publicados e o slug está correto.',
    );
  }
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------

// TTFB: leitura fixa do audit real do Lighthouse 13.4.1 (server-response-time).
// Não trocar por uma lista de aliases "só por garantia" — ver decisão no
// cabeçalho: uma troca de versão que mude isso deve FALHAR o script, não
// silenciosamente cair para outro nome.
const TTFB_AUDIT_ID = 'server-response-time';

async function runLighthouseOnce(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      logLevel: 'error',
    });

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse não retornou um LHR (runnerResult.lhr ausente).');
    }

    const { lhr } = runnerResult;

    const rawValues = {
      lcp: lhr.audits['largest-contentful-paint']?.numericValue,
      cls: lhr.audits['cumulative-layout-shift']?.numericValue,
      tbt: lhr.audits['total-blocking-time']?.numericValue,
      ttfb: lhr.audits[TTFB_AUDIT_ID]?.numericValue,
    };

    for (const [metric, value] of Object.entries(rawValues)) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(
          `Audit ausente ou com formato inesperado para "${metric}" no LHR desta execução ` +
            `(lighthouse@${lhr.lighthouseVersion}). Isso exige revisão da metodologia antes ` +
            'de continuar — o script não tenta um nome de audit alternativo.',
        );
      }
    }

    return {
      metrics: rawValues,
      lighthouseVersion: lhr.lighthouseVersion,
      hostUserAgent: lhr.environment?.hostUserAgent ?? null,
      configSettings: lhr.configSettings ?? null,
    };
  } finally {
    await chrome.kill();
  }
}

async function runSlotWithRetry(route, url, slotIndex, rawRuns) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SLOT; attempt++) {
    try {
      const result = await runLighthouseOnce(url);
      rawRuns.push({
        route: route.key,
        slot: slotIndex,
        attempt,
        status: 'success',
        error: null,
        lcp: result.metrics.lcp,
        cls: result.metrics.cls,
        tbt: result.metrics.tbt,
        ttfb: result.metrics.ttfb,
      });
      return { success: true, result };
    } catch (err) {
      lastError = err;
      rawRuns.push({
        route: route.key,
        slot: slotIndex,
        attempt,
        status: 'failed',
        error: String(err?.message ?? err),
        lcp: null,
        cls: null,
        tbt: null,
        ttfb: null,
      });
    }
  }
  console.error(
    `  slot ${slotIndex}/${RUNS_PER_ROUTE} de "${route.key}" falhou após ${MAX_ATTEMPTS_PER_SLOT} tentativa(s): ${lastError?.message ?? lastError}`,
  );
  return { success: false };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// CrUX / INP — opt-in, complementar, nunca invalida a baseline Lighthouse.
// ---------------------------------------------------------------------------

async function queryCrux(payload, apiKey) {
  const endpoint = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, metrics: ['interaction_to_next_paint'] }),
    });
  } catch (err) {
    return { outcome: 'query-error', error: `rede: ${err.message}` };
  }

  if (response.status === 404) {
    // Sinal documentado da CrUX API: sem histórico para esta URL/origem —
    // isso é "sem dado de campo", não um erro operacional.
    return { outcome: 'no-data' };
  }

  if (!response.ok) {
    // Credencial inválida, quota excedida, 5xx etc. — erro operacional real,
    // nunca deve ser confundido com "sem dado".
    let bodyText = '';
    try {
      bodyText = (await response.text()).slice(0, 300);
    } catch {
      /* ignorado — melhor esforço só para a mensagem de erro */
    }
    return { outcome: 'query-error', error: `HTTP ${response.status}: ${bodyText}` };
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    return { outcome: 'query-error', error: `resposta não-JSON: ${err.message}` };
  }

  const p75 = json?.record?.metrics?.interaction_to_next_paint?.percentiles?.p75;
  if (typeof p75 !== 'number') {
    return { outcome: 'no-data' };
  }
  return { outcome: 'field_data', value: p75 };
}

async function resolveInp(route, args, rawCruxQueries) {
  if (!args.publicOrigin) {
    rawCruxQueries.push({ route: route.key, tier: null, status: 'not requested' });
    return { value: null, unit: 'ms', status: 'not requested', source: null, scope: null };
  }

  const apiKey = process.env.CRUX_API_KEY;
  const fullUrl = joinUrl(args.publicOrigin, route.path);

  const urlResult = await queryCrux({ url: fullUrl, formFactor: 'PHONE' }, apiKey);
  rawCruxQueries.push({
    route: route.key,
    tier: 'url',
    target: fullUrl,
    status: urlResult.outcome,
    value: urlResult.value ?? null,
    error: urlResult.error ?? null,
  });

  if (urlResult.outcome === 'field_data') {
    return { value: urlResult.value, unit: 'ms', status: 'field_data', source: 'crux-url', scope: 'route' };
  }
  if (urlResult.outcome === 'query-error') {
    return {
      value: null,
      unit: 'ms',
      status: 'query-error',
      source: null,
      scope: null,
      error: urlResult.error,
    };
  }

  // urlResult.outcome === 'no-data' -> fallback real para o nível de origem,
  // só porque a CrUX confirmou ausência de dado para a URL específica.
  const originResult = await queryCrux({ origin: args.publicOrigin, formFactor: 'PHONE' }, apiKey);
  rawCruxQueries.push({
    route: route.key,
    tier: 'origin',
    target: args.publicOrigin,
    status: originResult.outcome,
    value: originResult.value ?? null,
    error: originResult.error ?? null,
  });

  if (originResult.outcome === 'field_data') {
    return {
      value: originResult.value,
      unit: 'ms',
      status: 'field_data',
      source: 'crux-origin',
      scope: 'origin',
    };
  }
  if (originResult.outcome === 'query-error') {
    return {
      value: null,
      unit: 'ms',
      status: 'query-error',
      source: null,
      scope: null,
      error: originResult.error,
    };
  }

  return { value: null, unit: 'ms', status: 'unavailable', source: null, scope: null };
}

// ---------------------------------------------------------------------------
// Markdown — gerado exclusivamente a partir do JSON produzido nesta execução.
// ---------------------------------------------------------------------------

function formatInp(inp) {
  if (inp.status === 'field_data') {
    const scopeNote = inp.scope === 'origin' ? ' (agregado da origem, não específico da rota)' : '';
    return `${inp.value} ms${scopeNote}`;
  }
  if (inp.status === 'query-error') {
    return `erro na consulta (${inp.error})`;
  }
  return inp.status; // "not requested" | "unavailable"
}

function generateMarkdown(report) {
  const lines = [];
  lines.push('# UXF-013 — Baseline de performance do FastCompre (estado atual)');
  lines.push('');
  lines.push(`Gerado em: ${report.metadata.executedAt}`);
  lines.push(`Status geral: **${report.status}**`);
  lines.push('');
  lines.push(
    `Lighthouse ${report.metadata.lighthouseVersion} · ${report.metadata.formFactor} · ` +
      `${report.metadata.runsPerRoute} runs/rota (mediana individual por métrica) · ` +
      `navigation mode`,
  );
  lines.push('');

  for (const [routeKey, routeData] of Object.entries(report.aggregated)) {
    lines.push(`## \`${routeKey}\``);
    lines.push('');
    if (routeData.status !== 'ok') {
      lines.push(`Status: **${routeData.status}** — sem baseline oficial para esta rota.`);
      lines.push('');
      continue;
    }
    lines.push('| Métrica | Mediana (5 runs) |');
    lines.push('|---|---|');
    lines.push(`| LCP | ${routeData.lcp.median} ${routeData.lcp.unit} |`);
    lines.push(`| CLS | ${routeData.cls.median} ${routeData.cls.unit} |`);
    lines.push(`| TBT | ${routeData.tbt.median} ${routeData.tbt.unit} |`);
    lines.push(`| TTFB | ${routeData.ttfb.median} ${routeData.ttfb.unit} |`);
    lines.push(`| INP (campo) | ${formatInp(routeData.inp)} |`);
    lines.push('');
  }

  lines.push('## Metadados de reprodução (UXQ-007 deve usar a mesma configuração)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.metadata, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const routes = buildRoutes(args);

  console.log('Preflight: verificando se as 3 rotas respondem HTTP 200...');
  for (const route of routes) {
    const url = joinUrl(args.baseUrl, route.path);
    await preflightCheckRoute(url);
    console.log(`  OK  ${route.key} -> ${url}`);
  }

  const rawLighthouseRuns = [];
  const rawCruxQueries = [];
  const aggregated = {};
  let firstSuccessfulRun = null;
  let anyRouteFailed = false;

  for (const route of routes) {
    console.log(`\nMedindo rota "${route.key}" (${RUNS_PER_ROUTE} execuções sequenciais)...`);
    const url = joinUrl(args.baseUrl, route.path);
    const successes = [];

    for (let slot = 1; slot <= RUNS_PER_ROUTE; slot++) {
      const outcome = await runSlotWithRetry(route, url, slot, rawLighthouseRuns);
      if (outcome.success) {
        successes.push(outcome.result);
        if (!firstSuccessfulRun) {
          firstSuccessfulRun = outcome.result;
        }
        console.log(`  slot ${slot}/${RUNS_PER_ROUTE} OK`);
      }
    }

    if (successes.length < RUNS_PER_ROUTE) {
      anyRouteFailed = true;
      aggregated[route.key] = {
        status: 'insufficient-data',
        lcp: null,
        cls: null,
        tbt: null,
        ttfb: null,
        inp: await resolveInp(route, args, rawCruxQueries),
      };
      console.error(
        `  Rota "${route.key}": só ${successes.length}/${RUNS_PER_ROUTE} execuções bem-sucedidas — ` +
          'sem baseline oficial para esta rota (nenhuma agregação parcial é gerada).',
      );
      continue;
    }

    aggregated[route.key] = {
      status: 'ok',
      lcp: { median: median(successes.map((r) => r.metrics.lcp)), unit: 'ms' },
      cls: { median: median(successes.map((r) => r.metrics.cls)), unit: 'unitless' },
      tbt: { median: median(successes.map((r) => r.metrics.tbt)), unit: 'ms' },
      ttfb: { median: median(successes.map((r) => r.metrics.ttfb)), unit: 'ms' },
      inp: await resolveInp(route, args, rawCruxQueries),
    };
  }

  // Metadados de configuração efetiva — sempre lidos de volta do LHR real
  // (lhr.configSettings), nunca redigitados manualmente.
  const configSettings = firstSuccessfulRun?.configSettings ?? null;

  const metadata = {
    lighthouseVersion: firstSuccessfulRun?.lighthouseVersion ?? null,
    chromeUserAgent: firstSuccessfulRun?.hostUserAgent ?? null,
    formFactor: configSettings?.formFactor ?? null,
    throttlingMethod: configSettings?.throttlingMethod ?? null,
    throttling: configSettings?.throttling ?? null,
    navigationMode: true,
    runsPerRoute: RUNS_PER_ROUTE,
    retryPolicy: `1 retry por slot (máx. ${MAX_ATTEMPTS_PER_SLOT} tentativas); falha do slot após retry => rota insufficient-data`,
    aggregation: 'median-per-metric (nunca median-run)',
    disableStorageReset: configSettings?.disableStorageReset ?? null,
    baseUrl: args.baseUrl,
    categorySlug: args.categorySlug,
    articleSlug: args.articleSlug,
    cruxRequested: Boolean(args.publicOrigin),
    cruxFormFactor: args.publicOrigin ? 'PHONE' : null,
    publicOriginForCrux: args.publicOrigin,
    executionMachine: {
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: os.cpus()?.[0]?.model ?? null,
      totalMemGb: Math.round((os.totalmem() / 2 ** 30) * 100) / 100,
      nodeVersion: process.version,
    },
    executedAt: new Date().toISOString(),
  };

  const report = {
    status: anyRouteFailed ? 'failed' : 'ok',
    metadata,
    raw: {
      lighthouseRuns: rawLighthouseRuns,
      cruxQueries: rawCruxQueries,
    },
    aggregated,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, generateMarkdown(report), 'utf8');

  console.log(`\nRelatório escrito em:\n  ${path.relative(ROOT, OUT_JSON)}\n  ${path.relative(ROOT, OUT_MD)}`);

  if (anyRouteFailed) {
    console.error('\nUma ou mais rotas ficaram "insufficient-data" — baseline não é oficial.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nErro: ${err.message}`);
  process.exitCode = 1;
});
