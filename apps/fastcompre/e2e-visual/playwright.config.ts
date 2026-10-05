import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  MOCK_PUBLIC_API_ORIGIN,
  FASTCOMPRE_BASE_URL,
  FASTCOMPRE_PORT,
  SITE_SLUG,
  SITE_URL,
  AFFILIATE_REDIRECT_URL,
  REVALIDATION_SECRET,
  STORAGE_PUBLIC_URL_BASE,
} from './fixtures.mjs';

/**
 * UXW-015 — infraestrutura de baseline visual do FastCompre. Mesma
 * convenção arquitetural do harness do Admin (UXA-020/UXE-016,
 * `apps/admin/e2e-visual/playwright.config.ts`), replicada aqui — não
 * movida para lá nem para um diretório compartilhado (decisão desta rodada:
 * "mesmo repositório de referência" = mesmo padrão/harness dentro do mesmo
 * monorepo, nunca um artefato físico único; ver entrada UXW-015 do
 * backlog). Só Chromium, viewport fixo, build de produção real via
 * `webServer`, nenhum `@axe-core/playwright`, nenhum CI/gate comparativo
 * (isso é `UXQ-001`/`UXQ-010`) — mesmos princípios, mesmas restrições.
 *
 * DUAS DIFERENÇAS REAIS frente ao Admin, ambas por necessidade estrutural
 * documentada na investigação da UXW-015, não por preferência:
 *
 * 1. `webServer` é um ARRAY de dois processos — o mock público
 *    (`mock-public-api.mjs`) precisa estar de pé ANTES do FastCompre
 *    aceitar requisições reais (`API_URL` aponta para ele) — diferente do
 *    Admin, cujo mock nunca precisa "existir" de verdade (`page.route()`
 *    intercepta no navegador, sem servidor nenhum por trás).
 * 2. `workers: 1` explícito (não só `fullyParallel: false`) — o mock
 *    guarda estado mutável (`populated`/`empty`) num único processo; dois
 *    workers rodando specs em paralelo poderiam alternar esse estado um
 *    por cima do outro no meio da captura um do outro.
 *
 * Ambiente definitivo de geração: Linux/Chromium — mesma decisão já
 * registrada no config do Admin. Bloqueio confirmado nesta sandbox
 * (`fonts.googleapis.com` negado pela política de rede da organização,
 * usado por `next/font/google` em `layout.tsx`) impede o `next build` de
 * completar aqui — os 5 PNGs reais nascem na geração feita pelo PO em
 * ambiente com rede (WSL2/Docker Linux), não nesta sandbox. Ver relatório
 * de implementação para o comando exato.
 */
const FASTCOMPRE_ROOT = path.resolve(__dirname, '..');

/**
 * Viewport determinístico, idêntico ao já estabelecido pelo Admin — não
 * inventar um recorte mobile/adicional sem necessidade (decisão já
 * fechada no desenho técnico aprovado). Extraído como constante (em vez
 * de um literal só dentro de `use`) porque precisa ser reafirmado
 * explicitamente dentro de `projects[0].use` também — ver comentário ali
 * (correção pontual, auditoria UXW-015 pós-commit `d071448`).
 */
const VIEWPORT = { width: 1440, height: 900 };

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
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
        // Correção pontual (auditoria UXW-015 pós-commit `d071448`):
        // `devices['Desktop Chrome']` traz seu PRÓPRIO `viewport`
        // (confirmado no pacote instalado, @playwright/test 1.62.1 →
        // 1280×720) — o spread acima sobrescrevia silenciosamente o
        // `viewport: VIEWPORT` já declarado no `use` de nível raiz deste
        // config, porque `use` de projeto tem precedência sobre `use` de
        // nível raiz na resolução do Playwright (o inverso do que o `use`
        // raiz, sozinho, presumia garantir). Reatribuído aqui, DEPOIS do
        // spread, para que o viewport efetivo do projeto `chromium` seja
        // sempre 1440×900 — nunca o 1280×720 do preset.
        viewport: VIEWPORT,
        // Mesmo binário Chromium pré-instalado do ambiente de geração —
        // idêntico ao Admin.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
  webServer: [
    {
      // Processo standalone (`.mjs`, sem dependência de transpilador — ver
      // doc comment de `fixtures.mjs`) — precisa estar respondendo antes do
      // FastCompre, já que `API_URL`/`STORAGE_PUBLIC_URL_BASE` do segundo
      // `webServer` abaixo apontam para ele.
      command: 'node mock-public-api.mjs',
      cwd: __dirname,
      url: `${MOCK_PUBLIC_API_ORIGIN}/__test-control__/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Build de produção real + `next start` (nunca `next dev`) — mesma
      // disciplina do Admin: o baseline precisa representar o que realmente
      // vai para produção. `env` abaixo é o único lugar onde as variáveis
      // server-only de `apps/fastcompre/src/lib/env.ts` são fornecidas — o
      // mock cobre `API_URL`/`STORAGE_PUBLIC_URL_BASE` por completo, nunca
      // uma API/Postgres real.
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
