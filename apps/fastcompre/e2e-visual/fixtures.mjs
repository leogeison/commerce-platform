/**
 * apps/fastcompre/e2e-visual/fixtures.mjs
 *
 * UXW-015 — única fonte de verdade dos dados/portas usados pelo baseline
 * visual do FastCompre: importado tanto por `mock-public-api.mjs` (processo
 * standalone, serve os dados) quanto por `playwright.config.ts` (monta a
 * `env` do `webServer` a partir dos mesmos valores) e pelos `*.visual.spec.ts`
 * (asserções/navegação usam os mesmos textos/slugs, nunca uma segunda cópia
 * divergente) — mesmo princípio já usado por `mock-api-origin.ts` no
 * harness do Admin (UXA-020/UXE-016), aplicado aqui a um conjunto maior de
 * dados porque o mock do FastCompre precisa ser um servidor HTTP real (ver
 * `mock-public-api.mjs` para o porquê).
 *
 * `.mjs` deliberado (não `.ts`) só neste arquivo e em `mock-public-api.mjs`:
 * o mock precisa rodar como processo Node standalone via `webServer.command`
 * do Playwright, num ambiente cujo suporte a `.ts` nativo (`--experimental-
 * strip-types`) não é garantido (o PO vai gerar os baselines reais numa
 * outra máquina/ambiente Linux, não necessariamente com a mesma versão do
 * Node desta sandbox) — ESM puro roda em qualquer Node moderno, sem
 * dependência nova (nenhum `tsx`/`ts-node` adicionado). `playwright.config.ts`
 * e os `*.spec.ts` continuam TypeScript normalmente; TS importa `.mjs` sem
 * problema (é só JavaScript).
 */

export const MOCK_PUBLIC_API_PORT = 4310;
export const MOCK_PUBLIC_API_ORIGIN = `http://127.0.0.1:${MOCK_PUBLIC_API_PORT}`;

export const FASTCOMPRE_PORT = 4300;
export const FASTCOMPRE_BASE_URL = `http://127.0.0.1:${FASTCOMPRE_PORT}`;

export const SITE_SLUG = 'fastcompre';
export const SITE_URL = `${FASTCOMPRE_BASE_URL}/`;
// Nunca navegado nos testes (nenhuma captura clica no link de afiliado) —
// só precisa satisfazer a validação de `env.ts` (origem válida).
export const AFFILIATE_REDIRECT_URL = 'http://127.0.0.1:4399/';
// Dummy, só para passar `z.string().min(16)` de `env.ts` — nunca usado como
// segredo real, só entre o mock/testes e este processo `next start` local.
export const REVALIDATION_SECRET = 'uxw015-e2e-visual-local-only-secret';
export const REVALIDATION_SECRET_HEADER = 'x-revalidation-secret';

/**
 * Valor de env passado para `next start` — `env.ts`/`next.config.ts`
 * exigem `STORAGE_PUBLIC_URL_BASE` e derivam `images.remotePatterns` dela
 * em produção real (comportamento inalterado, nunca sai de loopback).
 * `mock-public-api.mjs` ainda serve os bytes de `fixtures/placeholder.png`
 * sob este prefixo, mas essa rota HTTP deixou de ser consumida pelas 3
 * imagens exportadas abaixo (ver `PLACEHOLDER_IMAGE_DATA_URL`) — permanece
 * só para a variável de ambiente em si existir e ser uma URL http válida.
 */
export const STORAGE_PUBLIC_URL_BASE = `${MOCK_PUBLIC_API_ORIGIN}/local-dev-bucket`;

/**
 * Correção pontual (auditoria UXW-015 pós-commit `d071448`) — as 3
 * imagens dos fixtures (capa do Artigo, avatar do Autor, imagem do
 * Produto) deixam de apontar para uma URL servida por
 * `STORAGE_PUBLIC_URL_BASE` (`http://127.0.0.1:.../local-dev-bucket/*.png`)
 * e passam a embutir a mesma imagem real (`fixtures/placeholder.png`)
 * como `data:` URI.
 *
 * MOTIVO (confirmado lendo `next.config.ts`/`storage-remote-pattern.ts` e
 * o código-fonte real instalado de `next@16.2.12`,
 * `shared/lib/get-img-props.js`): o harness roda `next start` com
 * `NODE_ENV=production` (decisão já fechada da UXW-015) — em produção,
 * `resolveStorageImagesConfig` retorna `dangerouslyAllowLocalIP: false`
 * incondicionalmente, para qualquer hostname, de propósito (revisão de
 * segurança #2 documentada no próprio módulo — nunca conceder autorização
 * de rede privada ao Image Optimizer em produção). Isso está CORRETO e
 * não é alterado por esta correção — é proteção de produção real, não uma
 * lacuna do harness. Consequência prática: o Image Optimizer do
 * `next/image` recusa buscar qualquer imagem cujo host resolvido seja um
 * IP local/loopback (`127.0.0.1`, usado por este mock) nesse modo, mesmo
 * com o host já presente em `remotePatterns` — as 3 capturas com imagem
 * (`home-populated`, `category-populated`, `article-populated`) nunca
 * carregariam a imagem de verdade.
 *
 * SOLUÇÃO: `next/image` marca `unoptimized = true` automaticamente
 * sempre que `src` começa com `data:` (`get-img-props.js`, verificado no
 * pacote instalado: `if (!src || src.startsWith('data:') || ...)
 * unoptimized = true`) — o Image Optimizer nunca entra em ação para esse
 * `src`, então `remotePatterns`/`dangerouslyAllowLocalIP` nunca são
 * consultados. Nenhuma mudança em `next.config.ts`,
 * `storage-remote-pattern.ts` ou em qualquer proteção de produção — a
 * correção fica inteiramente contida neste harness (dado servido pelo
 * mock, nunca pela rota HTTP real do app).
 *
 * `mock-public-api.mjs` continua servindo `/local-dev-bucket/*` (rota
 * inerte agora, sem consumidor) — removê-la não é necessário para esta
 * correção e não foi feito, para manter o diff restrito ao mínimo.
 *
 * CORREÇÃO (execução Docker real, PO) — a versão anterior lia
 * `fixtures/placeholder.png` do disco via `readFileSync(path.join(
 * __dirname, ...))`, com `__dirname` derivado de `import.meta.url`. Isso
 * quebrou com `SyntaxError: Cannot use 'import.meta' outside a module` ao
 * carregar `playwright.config.ts` — causa raiz confirmada lendo o código
 * real instalado (`playwright/lib/common/index.js`, `installCJSHooks`):
 * quando o Playwright carrega a config/specs (`.ts`, formato forçado para
 * `"commonjs"` em qualquer `require()`), ele registra um hook que também
 * intercepta `.mjs` e passa pelo MESMO transform Babel de CJS — que
 * converte `import`/`export` para `require()`/`exports`, mas NUNCA toca
 * em `import.meta.url`, deixando-o como sintaxe inválida dentro do
 * wrapper CJS resultante. `.mjs` como extensão de arquivo não é garantia
 * de execução como ESM real quando alcançado via `require()` transitivo —
 * só quando é o próprio entrypoint (`node mock-public-api.mjs`, onde
 * `import.meta.url` sempre funcionou e nunca foi o problema).
 *
 * `__dirname` sozinho (sem `import.meta.url`) também não resolveria: é
 * `undefined` na avaliação ESM real que `mock-public-api.mjs` usa para
 * importar este arquivo (`import {...} from './fixtures.mjs'`) — nenhum
 * dos dois globals de autolocalização (`import.meta.url` nem `__dirname`)
 * é seguro nos DOIS contextos de carregamento deste arquivo ao mesmo
 * tempo, e um `cwd` explícito também não ajudaria: o `cwd` efetivo já
 * DIVERGE entre os dois consumidores — `mock-public-api.mjs` roda com
 * `cwd: __dirname` (este diretório, fixado explicitamente no `webServer`
 * de `playwright.config.ts`), enquanto a config/specs carregadas pelo
 * Playwright rodam com `cwd` = `apps/fastcompre` (de onde `pnpm --filter
 * fastcompre test:visual-baseline:update` invoca o `playwright test`) —
 * qualquer resolução relativa a `process.cwd()` aqui seria correta num
 * consumidor e errada no outro.
 *
 * SOLUÇÃO: eliminar a autolocalização por completo. `fixtures/
 * placeholder.png` é um fixture de teste pequeno e fixo (2792 bytes,
 * nunca muda em runtime) — `PLACEHOLDER_IMAGE_DATA_URL` passa a ser um
 * literal de string já em base64, sem nenhuma leitura de disco, nenhum
 * `import.meta`, nenhum `__dirname`, nenhum `path`/`fs`/`url` importado
 * neste arquivo. Byte a byte idêntico ao `fixtures/placeholder.png` real
 * (`sha256sum`: `7435f7569c3b52111e4389ccf417fa5b50c77531a53acc5ea78b9ec
 * 8278b64d2`, conferido nesta correção) — o PNG em disco continua sendo o
 * artefato-fonte (consumido por `mock-public-api.mjs`, que resolve seu
 * próprio caminho com segurança via o `import.meta.url`/`cwd: __dirname`
 * já existentes e inalterados nesta correção, já que esse arquivo é
 * SEMPRE o entrypoint real `node mock-public-api.mjs`, nunca alcançado
 * via `require()` do Playwright); se o PNG de origem for substituído no
 * futuro, este literal precisa ser regenerado junto (`base64 -w0
 * fixtures/placeholder.png`).
 */
const PLACEHOLDER_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAIAAAAVFBUnAAAKr0lEQVR4nO3WQQ3AIADAQEAWL3TgX8hMNCFZ7hT02bnvGQAAdNbrAACAvzFYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEPsATCcFhA2o1icAAAAASUVORK5CYII=';

export const CATEGORY_SLUG = 'fones-bluetooth';
export const CATEGORY_NAME = 'Fones Bluetooth';

export const ARTICLE_ID = '40000000-0000-4000-8000-000000000001';
export const ARTICLE_SLUG = 'melhor-fone-bluetooth-2026';
export const ARTICLE_TITLE = 'Melhores fones de ouvido bluetooth de 2026';
// Fixo — nunca `Date.now()` — mesma disciplina de determinismo do
// `dashboard.visual.spec.ts` (UXA-020).
export const ARTICLE_PUBLISHED_AT = '2026-01-08T08:00:00.000Z';

export const AUTHOR_NAME = 'Equipe Editorial FastCompre';

export const PRODUCT_ID = '40000000-0000-4000-8000-000000000002';
export const PRODUCT_NAME = 'Fone Bluetooth XY-200';
export const OFFER_ID = '40000000-0000-4000-8000-000000000003';

export const COVER_IMAGE_URL = PLACEHOLDER_IMAGE_DATA_URL;
export const AVATAR_IMAGE_URL = PLACEHOLDER_IMAGE_DATA_URL;
export const PRODUCT_IMAGE_URL = PLACEHOLDER_IMAGE_DATA_URL;

/**
 * `bodyMdx` mínimo para exercitar a superfície aprovada (item 7 do desenho
 * técnico): um heading (remapeado para `<h2>` pela própria página, já que o
 * `<h1>` canônico é `article.title`), um parágrafo, e EXATAMENTE um bloco
 * `:::product` — mesma gramática v1 já usada em `editor.visual.spec.ts`
 * (UXE-016)/`product-block-remark-plugin.spec.ts`. Nenhuma sintaxe de
 * `{width=N}` (UXE-022) — fora do escopo desta tarefa.
 */
export const ARTICLE_BODY_MDX = [
  '# Por que recomendamos este fone',
  '',
  'Testamos o modelo por duas semanas de uso diário, com foco em conforto e autonomia de bateria.',
  '',
  ':::product',
  'version: 1',
  `productId: ${PRODUCT_ID}`,
  ':::',
  '',
  'Ele se destaca pela autonomia de bateria e pelo cancelamento de ruído ativo.',
].join('\n');

function articleSummary() {
  return {
    id: ARTICLE_ID,
    categorySlug: CATEGORY_SLUG,
    type: 'REVIEW',
    title: ARTICLE_TITLE,
    slug: ARTICLE_SLUG,
    metaDescription: 'Comparativo dos melhores fones bluetooth custo-benefício de 2026.',
    coverImageUrl: COVER_IMAGE_URL,
    publishedAt: ARTICLE_PUBLISHED_AT,
  };
}

function articleDetail() {
  return {
    ...articleSummary(),
    bodyMdx: ARTICLE_BODY_MDX,
    author: {
      name: AUTHOR_NAME,
      avatarUrl: AVATAR_IMAGE_URL,
    },
    products: [
      {
        id: PRODUCT_ID,
        name: PRODUCT_NAME,
        description: 'Cancelamento de ruído ativo e 30h de bateria.',
        imageUrl: PRODUCT_IMAGE_URL,
        position: 1,
        offers: [
          {
            id: OFFER_ID,
            marketplace: 'AMAZON_BR',
            price: '349.90',
            currency: 'BRL',
            inStock: true,
          },
        ],
      },
    ],
  };
}

function categoryFixture() {
  return { name: CATEGORY_NAME, slug: CATEGORY_SLUG };
}

/**
 * Constrói o corpo de resposta de cada endpoint público a partir do estado
 * ativo do mock (`'populated'`/`'empty'`) — usado só por `mock-public-api.mjs`
 * (nunca importado pelos specs, que só precisam dos textos/slugs acima para
 * asserção/navegação).
 */
export function buildArticlesListResponse(state, categorySlug) {
  const matchesCategory = !categorySlug || categorySlug === CATEGORY_SLUG;
  const items = state === 'populated' && matchesCategory ? [articleSummary()] : [];
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
}

export function buildArticleDetailResponse(state, slug) {
  if (state !== 'populated' || slug !== ARTICLE_SLUG) {
    return null;
  }
  return articleDetail();
}

export function buildCategoryDetailResponse(slug) {
  // A Categoria em si sempre existe, nos dois estados — "vazia" significa
  // "categoria real sem nenhum Artigo publicado ainda", nunca "categoria
  // inexistente" (esse é o caso de 404, fora do escopo da UXW-015).
  if (slug !== CATEGORY_SLUG) {
    return null;
  }
  return categoryFixture();
}

export function buildCategoriesListResponse() {
  // Usado pelo `SiteHeader` (presente em toda página) — constante nos dois
  // estados, já que a existência da Categoria nunca varia, só sua contagem
  // de Artigos (isso é o array `items` de `/articles`, não este endpoint).
  const items = [categoryFixture()];
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 };
}
