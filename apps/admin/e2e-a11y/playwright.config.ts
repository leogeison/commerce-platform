import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';

/**
 * UXQ-001 — harness de acessibilidade em browser real
 * (`@axe-core/playwright`) contra build de produção do Admin.
 *
 * Infraestrutura deliberadamente isolada da UXA-020/UXE-016
 * (`e2e-visual/`): diretório próprio, config próprio, script próprio
 * (`test:a11y`). Nenhum golden PNG, nenhuma asserção axe entra em
 * `*.visual.spec.ts`, e vice-versa — os dois harnesses nunca compartilham
 * `testDir`/snapshots.
 *
 * `MOCK_API_ORIGIN` é importado somente-leitura de
 * `../e2e-visual/mock-api-origin.ts` (nenhum arquivo de `e2e-visual/` é
 * criado/modificado por esta tarefa) — mesma origem fictícia já usada lá,
 * para não duplicar um segundo literal que poderia divergir.
 *
 * Mesma disciplina já estabelecida pela UXA-020: build de produção real
 * via `webServer` (`pnpm run build && pnpm run start`, nunca `next dev`),
 * só Chromium, viewport determinístico — esta tarefa prova que o
 * harness/axe funcionam contra esse build real, não introduz nenhuma
 * convenção nova.
 *
 * `PORT` deliberadamente diferente do usado por `e2e-visual` (3100) —
 * evita colisão caso os dois harnesses sejam executados na mesma máquina
 * em algum momento; nunca ocorre hoje (jobs de CI separados, cada um numa
 * VM própria).
 */
const ADMIN_ROOT = path.resolve(__dirname, '..');
const PORT = 3110;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium do próprio ambiente de execução, em vez do download
        // padrão do Playwright — mesmo mecanismo já usado por
        // `e2e-visual/playwright.config.ts`. Quando não definida, o
        // Playwright resolve seu próprio Chromium padrão (ex.: o já
        // pré-instalado na imagem `mcr.microsoft.com/playwright`, usada
        // pelo job de CI desta tarefa).
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    cwd: ADMIN_ROOT,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_URL: MOCK_API_ORIGIN,
      PORT: String(PORT),
    },
  },
});
