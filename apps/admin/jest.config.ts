import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// `next/jest` gera a config integrada ao pipeline SWC do próprio Next.js —
// mesmo critério de `apps/fastcompre/jest.config.ts` (evita adicionar
// `ts-jest`/Babel como dependência extra só para esta tarefa).
const createJestConfig = nextJest({ dir: '.' });

// Mínimo necessário para testes unitários de `apps/admin/src/lib` (ADM-001)
// — sem infraestrutura de teste de componente/UI (sem jsdom, sem Testing
// Library), fora do escopo desta tarefa: nenhum componente React envolvido.
const customJestConfig: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
};

export default createJestConfig(customJestConfig);
