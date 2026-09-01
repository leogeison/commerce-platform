import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { MOCK_API_ORIGIN } from './mock-api-origin';

/**
 * UXA-020 — infraestrutura mínima de captura de baseline visual do
 * Dashboard, via mecanismo nativo do Playwright (`toHaveScreenshot()`).
 * Escopo deliberadamente restrito a isso: nenhum `@axe-core/playwright`,
 * nenhum job de CI, nenhuma execução comparativa além do que o próprio
 * `toHaveScreenshot()` já faz nativamente — isso é escopo de
 * `UXQ-001`/`UXQ-002`/`UXQ-010` (`docs/UX-Implementation-Backlog.md`).
 * Este config só produz e versiona os PNGs de referência; o runner de
 * acessibilidade em browser real (UXQ-001) terá config próprio, e a
 * comparação futura (UXQ-010) reaproveita só o diretório de snapshots
 * gerado aqui — mesmo mecanismo, sem infraestrutura nova (Riscos da
 * UXA-020 no backlog: captura precisa ser compatível com o runner
 * futuro).
 *
 * Só Chromium (decisão desta tarefa) — matriz de browsers é decisão de
 * UXQ-001, não desta.
 *
 * Ambiente definitivo de geração: Linux/Chromium (decisão explícita
 * desta rodada, alinhada ao runner `ubuntu-latest` que `UXQ-010` vai usar
 * no futuro para a comparação) — nunca o Windows local.
 */
const ADMIN_ROOT = path.resolve(__dirname, '..');
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  // Nomenclatura de snapshot: default do Playwright (inclui projeto e
  // plataforma no nome do arquivo) — não sobrescrita, para permanecer
  // compatível sem ajuste quando UXQ-001 eventualmente adicionar mais
  // projects a este mecanismo.
  use: {
    baseURL: BASE_URL,
    // Viewport determinístico (requisito desta rodada) — nenhuma variação
    // de breakpoint faz parte do escopo do baseline da UXA-020.
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium do próprio ambiente de geração (Linux), em vez do
        // download padrão do Playwright — mesmo binário usado para
        // qualquer outra automação de browser deste ambiente.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
  // Build de produção real + `next start` (nunca `next dev`) — mesma
  // disciplina já usada no projeto para medição (UXF-013/014, Lighthouse
  // contra build real): o baseline visual precisa representar o que
  // realmente vai para produção, não o modo de desenvolvimento.
  // `NEXT_PUBLIC_API_URL` é inlinado em build-time (Next.js) a partir de
  // `MOCK_API_ORIGIN` — o mesmo valor importado por
  // `dashboard.visual.spec.ts` para os padrões de `page.route()`, nunca
  // dois literais mantidos em sincronia manualmente (ver
  // `mock-api-origin.ts`). Nunca alcançada de fato: todo fetch é
  // interceptado antes de qualquer navegação, então o servidor sobe e
  // serve o Dashboard sem qualquer API/Postgres/sessão reais por trás.
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
