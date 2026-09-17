import 'server-only';
import type { z } from 'zod';
import {
  apiErrorSchema,
  listPublicArticlesQuerySchema,
  listPublicArticlesResponseSchema,
  listPublicCategoriesResponseSchema,
  publicArticleSchema,
  publicCategorySchema,
  type ListPublicArticlesResponse,
  type PublicArticle,
  type PublicCategory,
} from '@commerce-platform/contracts';
import { env } from '../env';
import { PublicApiError } from './errors';

/**
 * Cliente server-side da API pública (WEB-001; Architecture.md §31).
 *
 * `siteSlug` nunca é parâmetro destas funções — vem de `env.SITE_SLUG`: um
 * deployment de `apps/fastcompre` representa um único Site; resolução por
 * hostname/domínio está fora do escopo desta fase.
 *
 * NOTA SOBRE CACHE: `listPublicArticles`, `getPublicArticle` e
 * `getPublicCategory` não definem política explícita de cache/revalidação
 * nestas chamadas `fetch()`. A estratégia concreta necessária para cumprir
 * a intenção arquitetural de geração estática + cache + revalidação
 * (Architecture.md §13) será decidida nas tarefas que efetivamente
 * consomem essas funções, sem antecipar aqui a Fase 14 (Revalidação).
 * Exceção já fechada: `listPublicCategories` (UXW-003) define
 * `cache: 'force-cache'` de forma localizada só naquela chamada — ver seu
 * próprio doc comment para o porquê.
 */

type ListPublicArticlesInput = z.input<typeof listPublicArticlesQuerySchema>;

function publicSiteUrl(path: string): string {
  return `${env.API_URL}/public/sites/${env.SITE_SLUG}${path}`;
}

/**
 * `init` opcional — aditivo. Só invoca `fetch(url, init)` (2 argumentos)
 * quando `init` é de fato informado; caso contrário chama `fetch(url)` (1
 * argumento), exatamente como antes — as três chamadas existentes não
 * informam `init`, então nem seu comportamento real (idêntico de qualquer
 * forma no Fetch API) nem a assinatura exata da chamada capturada pelos
 * mocks de teste existentes (`toHaveBeenCalledWith(url)`, um só argumento)
 * mudam. Único motivo de `init` existir: `listPublicCategories` (UXW-003)
 * precisa de `{ cache: 'force-cache' }` localizado nesta única chamada —
 * ver doc comment daquela função para o porquê.
 */
async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  // Falha de rede (fetch rejeitando) propaga sem conversão para PublicApiError.
  const response = init ? await fetch(url, init) : await fetch(url);
  const body = await response.json().catch(() => undefined);
  return { ok: response.ok, status: response.status, body };
}

function throwApiError(status: number, body: unknown): never {
  const parsed = apiErrorSchema.safeParse(body);
  throw new PublicApiError(
    parsed.success ? parsed.data.message : `Erro ao chamar a API pública (status ${status}).`,
    { statusCode: status, code: parsed.success ? parsed.data.code : undefined },
  );
}

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown, status: number): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new PublicApiError('Resposta da API pública não corresponde ao contrato esperado.', {
      statusCode: status,
      code: 'INVALID_RESPONSE_SHAPE',
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * `GET /public/sites/:siteSlug/articles` (PUB-002).
 *
 * `listPublicArticlesQuerySchema` é a fonte de verdade também para a
 * entrada — `.parse()` aqui não é validação redundante: é o schema quem
 * aplica os defaults (`page: 1`, `pageSize: 20`) e os limites (`pageSize`
 * máximo 100) antes da URL ser montada, mesma responsabilidade que ele já
 * tem do lado da API.
 *
 * `404` aqui é sempre erro (nunca lista vazia) — a listagem nunca retorna
 * `404` legitimamente (página sem resultados é `200` com `items: []`,
 * PUB-002); um `404` só pode significar `SITE_SLUG` mal configurado neste
 * deployment.
 */
export async function listPublicArticles(
  query?: ListPublicArticlesInput,
): Promise<ListPublicArticlesResponse> {
  const parsedQuery = listPublicArticlesQuerySchema.parse(query ?? {});

  const searchParams = new URLSearchParams();
  searchParams.set('page', String(parsedQuery.page));
  searchParams.set('pageSize', String(parsedQuery.pageSize));
  if (parsedQuery.categorySlug) {
    searchParams.set('categorySlug', parsedQuery.categorySlug);
  }
  if (parsedQuery.type) {
    searchParams.set('type', parsedQuery.type);
  }

  const url = `${publicSiteUrl('/articles')}?${searchParams.toString()}`;
  const { ok, status, body } = await requestJson(url);

  if (!ok) {
    throwApiError(status, body);
  }

  return parseOrThrow(listPublicArticlesResponseSchema, body, status);
}

/**
 * `GET /public/sites/:siteSlug/articles/:slug` (PUB-003).
 *
 * `404` → `null`: PUB-003 usa `404` genérico tanto para "não existe" quanto
 * para "existe mas não está `PUBLISHED`" — é um estado válido esperado, não
 * um erro. A interpretação desse `null` pertence a quem chama esta função.
 */
export async function getPublicArticle(slug: string): Promise<PublicArticle | null> {
  const url = publicSiteUrl(`/articles/${encodeURIComponent(slug)}`);
  const { ok, status, body } = await requestJson(url);

  if (status === 404) {
    return null;
  }
  if (!ok) {
    throwApiError(status, body);
  }

  return parseOrThrow(publicArticleSchema, body, status);
}

/**
 * `GET /public/sites/:siteSlug/categories/:slug` (PUB-004).
 *
 * Mesmo critério de `404 → null` de `getPublicArticle`.
 */
export async function getPublicCategory(slug: string): Promise<PublicCategory | null> {
  const url = publicSiteUrl(`/categories/${encodeURIComponent(slug)}`);
  const { ok, status, body } = await requestJson(url);

  if (status === 404) {
    return null;
  }
  if (!ok) {
    throwApiError(status, body);
  }

  return parseOrThrow(publicCategorySchema, body, status);
}

/**
 * `GET /public/sites/:siteSlug/categories` (UXF-010), consumida pelo
 * `SiteHeader` (UXW-003) para montar o menu global de Categorias.
 *
 * Paginação real, não assumida: pede sempre `pageSize: 100` (o máximo do
 * contrato), mas nunca presume que uma única página basta — acumula
 * `items` e só para quando `page` alcança o `totalPages` devolvido pela
 * própria resposta (`total`/`totalPages` são a fonte de verdade, não o
 * tamanho do array recebido). Com `total: 0`, `totalPages` é `0` e o loop
 * termina após a primeira volta, com lista vazia.
 *
 * Sem reordenar/refiltrar no cliente — a API já ordena por `name asc` e já
 * filtra `archivedAt: null` estruturalmente (`findManyUnarchivedBySite`);
 * duplicar isso aqui seria uma segunda fonte de verdade para uma regra que
 * já pertence à API.
 *
 * `cache: 'force-cache'` informado diretamente nesta chamada (via `init`
 * de `requestJson`), não via `fetchCache` de segmento: quem consome esta
 * função é o `SiteHeader`, renderizado pelo layout raiz, e a decisão
 * fechada da UXW-003 proíbe alterar o `fetchCache` do root layout. Isso
 * funciona porque o endpoint interno de revalidação
 * (`api/internal/revalidate/route.ts`) já chama incondicionalmente
 * `revalidatePath('/', 'layout')` a cada gatilho — inclusive nos quatro
 * caminhos de mutação de Categoria, via UXF-010A — invalidando exatamente
 * o segmento onde este fetch roda. Nenhum TTL arbitrário, nenhuma cache
 * tag nova.
 *
 * Erro de rede/HTTP propaga (não retorna `null`/lista vazia silenciosa) —
 * a degradação graciosa (Header funcional, `<nav>` de Categorias omitido)
 * é responsabilidade de quem chama esta função (`SiteHeader`), não dela.
 */
export async function listPublicCategories(): Promise<PublicCategory[]> {
  const pageSize = 100;
  const items: PublicCategory[] = [];
  let page = 1;
  // Placeholder só para satisfazer a condição da primeira volta do loop —
  // sobrescrito pelo `totalPages` real devolvido já na primeira resposta,
  // antes de qualquer decisão de continuar ou parar.
  let totalPages = 1;

  do {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));

    const url = `${publicSiteUrl('/categories')}?${searchParams.toString()}`;
    const { ok, status, body } = await requestJson(url, { cache: 'force-cache' });

    if (!ok) {
      throwApiError(status, body);
    }

    const parsed = parseOrThrow(listPublicCategoriesResponseSchema, body, status);
    items.push(...parsed.items);
    totalPages = parsed.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}
