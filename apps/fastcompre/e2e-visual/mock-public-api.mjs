#!/usr/bin/env node
/**
 * apps/fastcompre/e2e-visual/mock-public-api.mjs
 *
 * UXW-015 — mock HTTP real da API pública consumida pelo FastCompre, para
 * dados 100% determinísticos sem API/Postgres real e sem rede externa.
 *
 * DIFERENÇA ESTRUTURAL FRENTE AO HARNESS DO ADMIN (UXA-020/UXE-016): lá,
 * `page.route()` intercepta no NAVEGADOR, porque o Admin busca dados via
 * `fetch()` client-side. O FastCompre busca dados inteiramente no
 * SERVIDOR — `apps/fastcompre/src/lib/public-api/client.ts` tem `import
 * 'server-only'` no topo, e todo `fetch()` roda dentro do processo Node do
 * `next start`, nunca no navegador controlado pelo Playwright. `page.route()`
 * nunca veria essas requisições. Por isso este arquivo precisa ser um
 * servidor HTTP de verdade, escutando numa porta real — não um padrão de
 * interceptação. Investigação completa registrada na entrada UXW-015 do
 * backlog.
 *
 * ESTADO MUTÁVEL (`populated`/`empty`) — decisão aprovada (Opção A): um
 * único mock, com um endpoint de controle interno
 * (`POST /__test-control__/fixture-state`) que alterna o fixture ativo.
 * Esse endpoint nunca é chamado pelo `apps/fastcompre` nem pelo navegador —
 * só pelo código Node do lado do teste (`fixture-state-control.ts`), então
 * não é um test hook público: nada em `apps/fastcompre/src` sabe que ele
 * existe. Por ser mutável, a suíte roda com `workers: 1` (ver
 * `playwright.config.ts`) — nunca dois testes trocando o estado ao mesmo
 * tempo.
 *
 * Cada endpoint espelha exatamente a forma exigida pelos schemas Zod reais
 * de `@commerce-platform/contracts` (`publicArticleSummarySchema`,
 * `publicArticleSchema`, `publicCategorySchema`,
 * `listPublicArticlesResponseSchema`/`listPublicCategoriesResponseSchema`)
 * — `apps/fastcompre` valida a resposta com `.safeParse()` antes de
 * renderizar; uma forma incompatível quebraria a página real, não só o
 * teste.
 *
 * Imagens: o mesmo processo também serve os bytes de
 * `fixtures/placeholder.png` sob `/local-dev-bucket/*` — content real,
 * decodificável pelo Image Optimizer do `next/image`, nunca um link
 * quebrado. Todo tráfego fica em loopback (127.0.0.1); nenhuma chamada sai
 * para a rede externa (diferente do bloqueio confirmado de
 * `fonts.googleapis.com`, que é uma dependência de build do Next, não deste
 * mock).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOCK_PUBLIC_API_PORT,
  SITE_SLUG,
  buildArticlesListResponse,
  buildArticleDetailResponse,
  buildCategoryDetailResponse,
  buildCategoriesListResponse,
} from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER_IMAGE_PATH = path.join(__dirname, 'fixtures', 'placeholder.png');

/** @type {'populated' | 'empty'} */
let activeState = 'populated';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function sendImage(res) {
  const bytes = await readFile(PLACEHOLDER_IMAGE_PATH);
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': bytes.length,
    // Sem cache — cada teste deve ver o arquivo de verdade, nunca uma
    // resposta 304 condicionada por um `If-None-Match` do navegador.
    'cache-control': 'no-store',
  });
  res.end(bytes);
}

const SITE_PREFIX = `/public/sites/${SITE_SLUG}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${MOCK_PUBLIC_API_PORT}`);

  try {
    // Endpoint de controle — nunca chamado pelo app real, só pelo helper
    // Node-side do teste (`fixture-state-control.ts`).
    if (req.method === 'POST' && url.pathname === '/__test-control__/fixture-state') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (body.state !== 'populated' && body.state !== 'empty') {
        return sendJson(res, 400, { error: 'INVALID_STATE' });
      }
      activeState = body.state;
      return sendJson(res, 200, { ok: true, state: activeState });
    }

    if (req.method === 'GET' && url.pathname === '/__test-control__/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/local-dev-bucket/')) {
      return await sendImage(res);
    }

    if (req.method === 'GET' && url.pathname === `${SITE_PREFIX}/articles`) {
      const categorySlug = url.searchParams.get('categorySlug') ?? undefined;
      return sendJson(res, 200, buildArticlesListResponse(activeState, categorySlug));
    }

    if (req.method === 'GET' && url.pathname === `${SITE_PREFIX}/categories`) {
      return sendJson(res, 200, buildCategoriesListResponse());
    }

    const articleDetailMatch = url.pathname.match(
      new RegExp(`^${SITE_PREFIX}/articles/([^/]+)$`),
    );
    if (req.method === 'GET' && articleDetailMatch) {
      const slug = decodeURIComponent(articleDetailMatch[1]);
      const article = buildArticleDetailResponse(activeState, slug);
      if (!article) {
        return sendJson(res, 404, { code: 'ARTICLE_NOT_FOUND', message: 'Artigo não encontrado.' });
      }
      return sendJson(res, 200, article);
    }

    const categoryDetailMatch = url.pathname.match(
      new RegExp(`^${SITE_PREFIX}/categories/([^/]+)$`),
    );
    if (req.method === 'GET' && categoryDetailMatch) {
      const slug = decodeURIComponent(categoryDetailMatch[1]);
      const category = buildCategoryDetailResponse(slug);
      if (!category) {
        return sendJson(res, 404, { code: 'CATEGORY_NOT_FOUND', message: 'Categoria não encontrada.' });
      }
      return sendJson(res, 200, category);
    }

    sendJson(res, 404, { code: 'NOT_FOUND', message: `Rota de mock não implementada: ${url.pathname}` });
  } catch (error) {
    // Nunca deveria acontecer com as rotas acima, mas evita que o processo
    // do mock morra silenciosamente numa exceção não tratada em meio à
    // suíte.
    sendJson(res, 500, { code: 'MOCK_INTERNAL_ERROR', message: String(error) });
  }
});

server.listen(MOCK_PUBLIC_API_PORT, '127.0.0.1', () => {
  console.log(`[mock-public-api] listening on http://127.0.0.1:${MOCK_PUBLIC_API_PORT}`);
});
