import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// `next/jest` gera a config integrada ao pipeline SWC do próprio Next.js —
// mesmo critério de `apps/fastcompre/jest.config.ts` (evita adicionar
// `ts-jest`/Babel como dependência extra).
const createJestConfig = nextJest({ dir: '.' });

// `testEnvironment: 'jsdom'` (ADM-002) — trocado de `'node'` (ADM-001)
// porque `login-form.spec.tsx` renderiza componentes React reais via
// `@testing-library/react`. Config única, sem múltiplos projects Jest:
// os specs de `lib/` (ADM-001, sem DOM) continuam rodando normalmente sob
// `jsdom` — não dependem de nenhuma API exclusiva de `node`.
const customJestConfig: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
};

export default createJestConfig(customJestConfig);
