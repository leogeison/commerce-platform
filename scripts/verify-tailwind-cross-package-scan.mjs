#!/usr/bin/env node
/**
 * scripts/verify-tailwind-cross-package-scan.mjs
 *
 * UXF-004 — regressão do content-scanning cross-package do Tailwind.
 *
 * Mantém sua PRÓPRIA lista estática de classes esperadas (EXPECTED_CLASSES
 * abaixo), independente das classes escritas em packages/ui/src/probe.tsx.
 * A duplicação é intencional: se este script lesse as classes esperadas
 * diretamente do componente sob teste, uma mudança acidental no probe
 * sempre "passaria" porque a expectativa mudaria junto com a
 * implementação — o teste perderia a capacidade de detectar drift real.
 * Mantendo as duas listas fisicamente separadas, uma divergência entre
 * probe.tsx e EXPECTED_CLASSES é, por construção, o próprio tipo de sinal
 * que este script existe para capturar.
 *
 * Se packages/ui/src/probe.tsx mudar deliberadamente, atualize
 * EXPECTED_CLASSES aqui manualmente, na mesma tarefa/commit.
 *
 * Pré-requisito: rodar as builds antes (este script não builda nada
 * sozinho, só inspeciona o CSS já gerado):
 *   pnpm --filter admin build && pnpm --filter fastcompre build
 *
 * Uso: node scripts/verify-tailwind-cross-package-scan.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPS = ['admin', 'fastcompre'];

// Espelha manualmente as classes declaradas em packages/ui/src/probe.tsx —
// ver o comentário acima sobre por que isso não é importado de lá.
const EXPECTED_CLASSES = [
  'flex',
  'items-center',
  'gap-2',
  'rounded-md',
  'border',
  'p-4',
  'text-sm',
  'font-semibold',
  'text-slate-700',
];

function readGeneratedCss(appName) {
  const cssDir = path.join(ROOT, 'apps', appName, '.next', 'static', 'chunks');
  let files;
  try {
    files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  } catch {
    throw new Error(
      `Nenhum CSS em apps/${appName}/.next/static/chunks — rode "pnpm --filter ${appName} build" antes.`,
    );
  }
  if (files.length === 0) {
    throw new Error(`Nenhum .css em apps/${appName}/.next/static/chunks.`);
  }
  return files.map((f) => readFileSync(path.join(cssDir, f), 'utf8')).join('\n');
}

function extractRule(css, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Nota (UXF-004, implementação): a inspeção do CSS real gerado pelo
  // Tailwind v4 mostrou que as regras não vêm minificadas — há um espaço
  // entre o seletor e "{" (ex.: ".flex {", não ".flex{"). O "\\s*" abaixo
  // cobre esse formato real; validado contra saída real de
  // tailwindcss@4.3.3 antes de codificar isso aqui.
  const match = css.match(new RegExp(`\\.${escaped}(?=[\\s,{:.])\\s*{[^}]*}`));
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

const cssByApp = Object.fromEntries(APPS.map((a) => [a, readGeneratedCss(a)]));
let hasFailure = false;
const report = [];

for (const className of EXPECTED_CLASSES) {
  const perApp = Object.fromEntries(APPS.map((a) => [a, extractRule(cssByApp[a], className)]));
  const missing = APPS.filter((a) => !perApp[a]);
  if (missing.length > 0) {
    hasFailure = true;
    report.push(`FAIL  .${className} ausente em: ${missing.join(', ')}`);
    continue;
  }
  const [admin, fastcompre] = APPS.map((a) => perApp[a]);
  if (admin !== fastcompre) {
    hasFailure = true;
    report.push(
      `FAIL  .${className} difere entre apps:\n  admin:      ${admin}\n  fastcompre: ${fastcompre}`,
    );
    continue;
  }
  report.push(`PASS  .${className}`);
}

console.log(report.join('\n'));
if (hasFailure) {
  console.error('\nRegressão de content-scanning cross-package detectada.');
  process.exit(1);
}
console.log('\nTodas as classes esperadas presentes e equivalentes nos dois builds.');
