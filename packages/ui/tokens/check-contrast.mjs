#!/usr/bin/env node
/**
 * packages/ui/tokens/check-contrast.mjs
 *
 * Teste automatizado de contraste — UXF-001 (Fundação de tokens de design).
 *
 * Lê e resolve os próprios tokens declarados em colors.css e
 * semantic-colors.css — NÃO mantém nenhuma cópia independente dos valores
 * HEX. Se um HEX for alterado num desses arquivos e isso fizer um par
 * deixar de cumprir o limiar de contraste exigido, este script falha
 * (exit code 1). Não há segunda fonte para divergir.
 *
 * Erros tratados explicitamente como falha (nunca produzem falso PASS):
 *   - token referenciado que não existe em nenhum arquivo lido;
 *   - var(--token) que não resolve (token ausente ou valor em formato
 *     inesperado, nem HEX literal nem var());
 *   - referência circular entre tokens (--a: var(--b); --b: var(--a);).
 *
 * Sem dependências externas — apenas Node.js (fs/path/url nativos). Não
 * requer package.json em packages/ui (que só nasce em UXF-002).
 *
 * Uso: node packages/ui/tokens/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Arquivos-fonte lidos como texto — esta é a única fonte de verdade dos
// valores usados no teste.
const SOURCE_FILES = ['colors.css', 'semantic-colors.css'];

// ---------------------------------------------------------------------------
// 1. Extração das declarações de custom property dos arquivos-fonte.
// ---------------------------------------------------------------------------

/**
 * Extrai pares `--nome: valor;` de um texto CSS. Não é um parser CSS
 * genérico — é suficiente para o formato usado nestes arquivos (declarações
 * simples dentro de blocos de regra, sem aninhamento, sem calc()).
 */
function extractDeclarations(cssText, fileName, target) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const declRegex = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = declRegex.exec(withoutComments)) !== null) {
    const [, rawName, rawValue] = match;
    // Chaves são normalizadas sem o prefixo "--" (ex.: "color-text-primary"),
    // tanto para as declarações quanto para as referências var() resolvidas
    // abaixo — evita divergência entre "--nome" e "nome" no mapa.
    const name = rawName.replace(/^--/, '');
    const value = rawValue.trim();
    if (target.has(name) && target.get(name).value !== value) {
      throw new Error(
        `Token "--${name}" declarado mais de uma vez com valores diferentes ` +
          `(${target.get(name).file} e ${fileName}). Ambíguo — corrija antes de rodar o teste.`,
      );
    }
    target.set(name, { value, file: fileName });
  }
}

const allDeclarations = new Map();
for (const file of SOURCE_FILES) {
  const fullPath = path.join(__dirname, file);
  const text = readFileSync(fullPath, 'utf8');
  extractDeclarations(text, file, allDeclarations);
}

// ---------------------------------------------------------------------------
// 2. Resolução recursiva de var(--token) até um literal #RRGGBB.
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
const VAR_RE = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/;

function resolveToken(name, visiting = []) {
  if (visiting.includes(name)) {
    throw new Error(`Referência circular detectada: ${[...visiting, name].map((n) => `--${n}`).join(' -> ')}`);
  }
  const entry = allDeclarations.get(name);
  if (!entry) {
    throw new Error(
      `Token "--${name}" não existe em nenhum dos arquivos lidos (${SOURCE_FILES.join(', ')}).`,
    );
  }
  const { value } = entry;
  if (HEX_RE.test(value)) {
    return value.toUpperCase();
  }
  const varMatch = value.match(VAR_RE);
  if (varMatch) {
    // VAR_RE captura o nome com o prefixo "--"; normaliza antes de recursar
    // para casar com as chaves do mapa (sem prefixo).
    return resolveToken(varMatch[1].replace(/^--/, ''), [...visiting, name]);
  }
  throw new Error(
    `Token "--${name}" tem valor "${value}" que não é um HEX literal (#RRGGBB) nem um var() resolvível.`,
  );
}

// ---------------------------------------------------------------------------
// 3. Cálculo de contraste WCAG (luminância relativa).
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [0, 1, 2].map((i) => parseInt(clean.slice(i * 2, i * 2 + 2), 16));
}

function linearize(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map(linearize);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// 4. Pares a validar — por NOME de token semântico, nunca por HEX literal.
// ---------------------------------------------------------------------------

const NORMAL_TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3.0;

const ASSERTED_PAIRS = [
  ['color-text-primary', 'color-surface-page', NORMAL_TEXT_MIN, 'texto primário / fundo de página'],
  ['color-text-primary', 'color-surface-raised', NORMAL_TEXT_MIN, 'texto primário / superfície elevada'],
  ['color-text-secondary', 'color-surface-page', NORMAL_TEXT_MIN, 'texto secundário / fundo de página'],
  ['color-text-secondary', 'color-surface-raised', NORMAL_TEXT_MIN, 'texto secundário / superfície elevada'],
  ['color-text-muted', 'color-surface-raised', NORMAL_TEXT_MIN, 'texto muted (normal) / superfície elevada'],
  ['color-text-muted', 'color-surface-page', NORMAL_TEXT_MIN, 'texto muted (normal) / fundo de página'],
  ['color-on-accent-text', 'color-accent-fill-default', NORMAL_TEXT_MIN, 'texto sobre preenchimento de acento (default)'],
  ['color-on-accent-text', 'color-accent-fill-hover', NORMAL_TEXT_MIN, 'texto sobre preenchimento de acento (hover)'],
  ['color-on-accent-text', 'color-accent-fill-active', NORMAL_TEXT_MIN, 'texto sobre preenchimento de acento (active)'],
  ['color-on-danger-text', 'color-feedback-danger-fill', NORMAL_TEXT_MIN, 'texto sobre preenchimento de erro'],
  ['color-accent-text', 'color-surface-raised', NORMAL_TEXT_MIN, 'texto/link de acento / superfície elevada'],
  ['color-accent-text', 'color-surface-page', NORMAL_TEXT_MIN, 'texto/link de acento / fundo de página'],
  ['color-accent-subtle-text', 'color-accent-subtle-bg', NORMAL_TEXT_MIN, 'texto de acento / fundo sutil de acento'],
  ['color-feedback-danger-text', 'color-surface-raised', NORMAL_TEXT_MIN, 'texto de erro / superfície elevada'],
  ['color-feedback-danger-text', 'color-feedback-danger-subtle-bg', NORMAL_TEXT_MIN, 'texto de erro / fundo sutil de erro'],
  ['color-border-meaningful', 'color-surface-raised', NON_TEXT_MIN, 'borda significativa / superfície elevada (não-texto)'],
  ['color-icon-muted', 'color-surface-raised', NON_TEXT_MIN, 'ícone com significado próprio / superfície elevada (não-texto)'],
  ['color-focus-ring', 'color-surface-raised', NON_TEXT_MIN, 'anel de foco / superfície elevada (não-texto)'],
  ['color-feedback-danger-fill', 'color-surface-raised', NON_TEXT_MIN, 'preenchimento/indicador de erro / superfície elevada (não-texto)'],
  ['color-feedback-warning-text', 'color-surface-subtle', NON_TEXT_MIN, 'ícone de warning / superfície sutil (não-texto) — UXA-019D, fundo real do Hourglass em "Aguardando publicação"'],
];

// Pares deliberadamente NÃO avaliados numericamente — listados para deixar
// a decisão explícita, não para simular uma checagem que não se aplica.
const DOCUMENTED_EXEMPTIONS = [
  [
    'color-text-disabled',
    'color-surface-raised',
    'WCAG isenta conteúdo desabilitado do requisito de contraste de texto; nunca é o único indicador do estado desabilitado.',
  ],
  [
    'color-border-subtle',
    'color-surface-raised',
    'borda decorativa (divisores), não carrega significado sozinha — sem requisito de contraste.',
  ],
  [
    'color-border-default',
    'color-surface-raised',
    'borda decorativa padrão (repouso de input), não carrega significado sozinha — sem requisito de contraste.',
  ],
  [
    'color-text-inverse',
    null,
    'declarado para uso geral sobre uma futura superfície escura; sem par de teste nesta tarefa porque nenhuma superfície semântica escura consumidora existe ainda (o uso atual sobre preenchimentos de acento/erro é coberto por on-accent-text/on-danger-text, já testados acima).',
  ],
];

// ---------------------------------------------------------------------------
// 5. Execução.
// ---------------------------------------------------------------------------

let hasFailure = false;
const rows = [];

for (const [fgName, bgName, minRatio, label] of ASSERTED_PAIRS) {
  try {
    const fgHex = resolveToken(fgName);
    const bgHex = resolveToken(bgName);
    const ratio = contrastRatio(fgHex, bgHex);
    const pass = ratio >= minRatio;
    if (!pass) {
      hasFailure = true;
    }
    rows.push({
      label,
      pair: `${fgName} (${fgHex}) vs ${bgName} (${bgHex})`,
      ratio: ratio.toFixed(2),
      required: minRatio.toFixed(1),
      result: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    hasFailure = true;
    rows.push({
      label,
      pair: `${fgName} vs ${bgName}`,
      ratio: '—',
      required: minRatio.toFixed(1),
      result: `ERROR: ${err.message}`,
    });
  }
}

console.log('=== Teste automatizado de contraste — UXF-001 ===\n');
console.log(`Fonte: ${SOURCE_FILES.join(', ')} (lidos e resolvidos dinamicamente — sem cópia de HEX)\n`);

for (const r of rows) {
  console.log(`- ${r.label}`);
  console.log(`  ${r.pair}`);
  console.log(`  ${r.ratio}:1  (exigido >= ${r.required}:1)  ${r.result}`);
}

console.log('\n--- Pares deliberadamente isentos ou não avaliados numericamente (documentação) ---');
for (const [fgName, bgName, reason] of DOCUMENTED_EXEMPTIONS) {
  if (bgName === null) {
    try {
      resolveToken(fgName);
      console.log(`- ${fgName}: ${reason}`);
    } catch (err) {
      hasFailure = true;
      console.log(`- ${fgName}: ERROR: ${err.message}`);
    }
    continue;
  }
  try {
    const fgHex = resolveToken(fgName);
    const bgHex = resolveToken(bgName);
    const ratio = contrastRatio(fgHex, bgHex);
    console.log(`- ${fgName} (${fgHex}) vs ${bgName} (${bgHex}) => ${ratio.toFixed(2)}:1 — ${reason}`);
  } catch (err) {
    hasFailure = true;
    console.log(`- ${fgName} vs ${bgName}: ERROR: ${err.message}`);
  }
}

const passed = rows.filter((r) => r.result === 'PASS').length;
console.log(`\n${passed}/${rows.length} pares avaliados cumprem o limiar exigido.`);

if (hasFailure) {
  console.error('\nFALHA: um ou mais pares não cumprem o contraste exigido, ou um token não pôde ser resolvido.');
  process.exit(1);
} else {
  console.log('\nTodos os pares avaliados cumprem o limiar WCAG 2.2 AA aplicável.');
  process.exit(0);
}
