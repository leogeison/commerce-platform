import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// `next/jest` gera a config integrada ao pipeline SWC do próprio Next.js —
// evita adicionar `ts-jest`/Babel como dependência extra só para esta
// tarefa (diferente de `apps/api`, que precisa de `ts-jest` por não usar
// Next.js).
const createJestConfig = nextJest({ dir: '.' });

// Mínimo necessário para testes unitários server-side (WEB-001) — sem
// infraestrutura de teste de componente/UI (sem jsdom, sem Testing
// Library), fora do escopo desta tarefa.
const customJestConfig: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
};

export default createJestConfig(customJestConfig);
