import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// `next/jest` gera a config integrada ao pipeline SWC do próprio Next.js —
// evita adicionar `ts-jest`/Babel como dependência extra só para esta
// tarefa (diferente de `apps/api`, que precisa de `ts-jest` por não usar
// Next.js).
const createJestConfig = nextJest({ dir: '.' });

// `testEnvironment: 'jsdom'` (UXF-008) — trocado de `'node'` (WEB-001).
// Investigação (Etapa D, Seção 6 + leitura integral dos 10 specs
// existentes) confirmou que nenhum spec ou módulo de `src/` depende de
// `typeof window`/`document`/qualquer API exclusiva de `node` — por isso
// `jsdom` é adequado como ambiente padrão desta suíte específica, e não uma
// generalização de que `jsdom` seria superconjunto seguro de `node` em
// qualquer contexto.
//
// A única exceção real é `route.spec.ts`, que instancia `Request` nativo
// do Node diretamente (Route Handler) — Web API que `jsdom` não expõe como
// global. Esse spec mantém `node` explicitamente via pragma
// `@jest-environment` local (ver comentário no topo daquele arquivo); os
// outros 9 specs + o spec de UXF-008 rodam sob `jsdom`.
const customJestConfig: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
};

export default createJestConfig(customJestConfig);
