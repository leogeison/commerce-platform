import 'server-only';
import type { z } from 'zod';
import {
  apiErrorSchema,
  listPublicArticlesQuerySchema,
  listPublicArticlesResponseSchema,
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
 * NOTA SOBRE CACHE: nenhuma destas chamadas `fetch()` define política
 * explícita de cache/revalidação. A estratégia concreta necessária para
 * cumprir a intenção arquitetural de geração estática + cache + revalidação
 * (Architecture.md §13) será decidida nas tarefas que efetivamente
 * consomem este cliente, sem antecipar aqui a Fase 14 (Revalidação).
 */

type ListPublicArticlesInput = z.input<typeof listPublicArticlesQuerySchema>;

function publicSiteUrl(path: string): string {
  return `${env.API_URL}/public/sites/${env.SITE_SLUG}${path}`;
}

async function requestJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  // Falha de rede (fetch rejeitando) propaga sem conversão para PublicApiError.
  const response = await fetch(url);
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
