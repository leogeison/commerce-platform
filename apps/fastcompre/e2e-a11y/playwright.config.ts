import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  MOCK_PUBLIC_API_ORIGIN,
  FASTCOMPRE_PORT,
  FASTCOMPRE_BASE_URL,
  SITE_SLUG,
  SITE_URL,
  AFFILIATE_REDIRECT_URL,
  REVALIDATION_SECRET,
  STORAGE_PUBLIC_URL_BASE,
} from '../e2e-visual/fixtures.mjs';

/**
 * UXQ-001 — harness de acessibilidade em browser real
 * (`@axe-core/playwright`) contra build de produção do FastCompre.
 *
 * Infraestrutura deliberadamente isolada da UXW-015 (`e2e-visual/`):
 * diretório próprio, config próprio, script próprio (`test:a11y`).
 * Reutiliza somente-leitura o mock e as constantes já existentes
 * (`../e2e-visual/mock-public-api.mjs`, `../e2e-visual/fixtures.mjs`) —
 * nenhum segundo mock/fixture foi criado, nenhum arquivo de
 * `e2e-visual/` é modificado por esta tarefa.
 *
 * Mesma estrutura de dois processos já validada na UXW-015 (o mock
 * precisa estar de pé antes do FastCompre aceitar requisições reais) e
 * mesmas portas de `fixtures.mjs` (`MOCK_PUBLIC_API_PORT`/
 * `FASTCOMPRE_PORT`, fixas) — reuso literal, não uma segunda porta
 * inventada: os dois harnesses nunca rodam ao mesmo tempo na mesma
 * máquina hoje (jobs de CI separados, cada um numa VM própria).
 *
 * Build de produção real via `webServer` (nunca `next dev`), só
 * Chromium, mesmo viewport determinístico do Admin/UXW-015 — esta tarefa
 * prova que o harness/axe funcionam contra esse build real, não
 * introduz nenhuma convenção nova.
 */
const FASTCOMPRE_ROOT = path.resolve(__dirname, '..');
const MOCK_SCRIPT_DIR = path.resolve(__dirname, '../e2e-visual');
const VIEWPORT = { width: 1440, height: 900 };

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  // Mesmo motivo da UXW-015: o mock guarda estado mutável
  // (`populated`/`empty`) num único processo — dois workers rodando
  // specs em paralelo poderiam alternar esse estado um por cima do
  // outro no meio da execução um do outro.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: FASTCOMPRE_BASE_URL,
    viewport: VIEWPORT,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Correção já conhecida da UXW-015 (auditoria pós-commit
        // `d071448`): `devices['Desktop Chrome']` traz seu próprio
        // `viewport` e sobrescreveria silenciosamente o `viewport`
        // declarado no `use` de nível raiz — reatribuído aqui, depois
        // do spread, pelo mesmo motivo.
        viewport: VIEWPORT,
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
  webServer: [
    {
      // Processo standalone, mesmo script da UXW-015 — precisa estar
      // respondendo antes do FastCompre, já que `API_URL`/
      // `STORAGE_PUBLIC_URL_BASE` do segundo `webServer` abaixo apontam
      // para ele.
      command: 'node mock-public-api.mjs',
      cwd: MOCK_SCRIPT_DIR,
      url: `${MOCK_PUBLIC_API_ORIGIN}/__test-control__/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm run build && pnpm run start',
      cwd: FASTCOMPRE_ROOT,
      url: FASTCOMPRE_BASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'production',
        PORT: String(FASTCOMPRE_PORT),
        SITE_SLUG,
        API_URL: MOCK_PUBLIC_API_ORIGIN,
        SITE_URL,
        AFFILIATE_REDIRECT_URL,
        REVALIDATION_SECRET,
        STORAGE_PUBLIC_URL_BASE,
      },
    },
  ],
});
