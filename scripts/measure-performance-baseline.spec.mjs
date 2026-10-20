// scripts/measure-performance-baseline.spec.mjs
//
// Teste mínimo da extensão --out-prefix (UXQ-007). NÃO cobre a medição em
// si (preflight HTTP, Lighthouse, agregação, CrUX) — isso nunca teve teste
// automatizado, por decisão congelada da UXF-013 ("Testes esperados: nenhum
// automatizado — é o próprio instrumento de medição"), decisão preservada
// sem alteração por este teste. Cobre apenas as duas garantias pedidas:
//   1. comportamento default preservado (sem --out-prefix);
//   2. --out-prefix direciona os dois outputs corretamente, sem jamais
//      coincidir com a baseline original da UXF-013.
//
// Executar: node --test scripts/measure-performance-baseline.spec.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveOutputTargets } from './measure-performance-baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_JSON = path.join(ROOT, 'docs', 'performance', 'baseline-uxf-013.json');
const DEFAULT_MD = path.join(ROOT, 'docs', 'performance', 'baseline-uxf-013.md');

test('parseArgs: outPrefix é null por padrão (comportamento default preservado)', () => {
  const args = parseArgs([
    '--category-slug=eletronicos-para-viagem',
    '--article-slug=carregador-usb-c-65w-gan-vale-a-pena',
  ]);
  assert.equal(args.outPrefix, null);
});

test('parseArgs: --out-prefix é aceito e propagado sem afetar os demais args', () => {
  const args = parseArgs([
    '--category-slug=eletronicos-para-viagem',
    '--article-slug=carregador-usb-c-65w-gan-vale-a-pena',
    '--out-prefix=docs/performance/final-uxq-007',
  ]);
  assert.equal(args.outPrefix, 'docs/performance/final-uxq-007');
  assert.equal(args.baseUrl, 'http://localhost:3002');
  assert.equal(args.categorySlug, 'eletronicos-para-viagem');
  assert.equal(args.articleSlug, 'carregador-usb-c-65w-gan-vale-a-pena');
});

test('resolveOutputTargets: sem --out-prefix, caminhos são exatamente os originais da UXF-013', () => {
  const targets = resolveOutputTargets({ outPrefix: null });
  assert.equal(targets.outJsonPath, DEFAULT_JSON);
  assert.equal(targets.outMdPath, DEFAULT_MD);
  assert.equal(targets.outDirPath, path.dirname(DEFAULT_JSON));
  assert.equal(targets.markdownOptions, undefined);
});

test('resolveOutputTargets: com --out-prefix, direciona para <prefix>.json/.md, nunca para a baseline original', () => {
  const targets = resolveOutputTargets({ outPrefix: 'docs/performance/final-uxq-007' });
  assert.equal(targets.outJsonPath, path.join(ROOT, 'docs', 'performance', 'final-uxq-007.json'));
  assert.equal(targets.outMdPath, path.join(ROOT, 'docs', 'performance', 'final-uxq-007.md'));
  assert.equal(targets.outDirPath, path.join(ROOT, 'docs', 'performance'));
  assert.notEqual(targets.outJsonPath, DEFAULT_JSON);
  assert.notEqual(targets.outMdPath, DEFAULT_MD);
  assert.equal(targets.markdownOptions.title, '# UXQ-007 — Medição final de performance do FastCompre');
});

test('resolveOutputTargets: --out-prefix absoluto também funciona (path.resolve é idempotente)', () => {
  const absolutePrefix = path.join(ROOT, 'docs', 'performance', 'final-uxq-007');
  const targets = resolveOutputTargets({ outPrefix: absolutePrefix });
  assert.equal(targets.outJsonPath, `${absolutePrefix}.json`);
  assert.equal(targets.outMdPath, `${absolutePrefix}.md`);
});
