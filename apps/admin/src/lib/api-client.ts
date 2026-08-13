import type { z } from 'zod';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { env } from './env';
import { AdminApiError } from './api-error';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Cliente HTTP reutilizável de `apps/admin` para chamadas à API feitas no
 * navegador (ADM-001; Alternativa B aprovada — Architecture.md §15).
 *
 * `credentials: 'include'` sempre presente, sem opção de desligar: é o
 * navegador quem mantém o cookie `HttpOnly`/host-only da API
 * (`api.fastcompre.com`) e o anexa automaticamente nas chamadas cross-origin
 * liberadas por CORS (`ADMIN_ORIGIN`) — o admin nunca lê, copia ou possui
 * esse cookie (nem um equivalente próprio). Nenhum BFF, nenhuma Server
 * Action/Route Handler como proxy de autenticação.
 *
 * URL montada por concatenação simples (`${env.NEXT_PUBLIC_API_URL}${path}`)
 * — sem `new URL()`/URL builder genérico. Segura contra barra dupla porque
 * `env.NEXT_PUBLIC_API_URL` já chega normalizada sem barra final
 * (`env.ts`); `path` é responsabilidade de quem chama (sempre começa com
 * `/`, segmentos dinâmicos via `encodeURIComponent`).
 *
 * `responseSchema` é sempre fornecido por quem chama (cada endpoint futuro
 * — `ADM-002` em diante — passa o schema Zod do contrato correspondente).
 * Endpoints sem corpo de resposta (ex.: logout) passam `z.void()`: como
 * corpo vazio já é `undefined` (ver `parseBody`), `z.void().safeParse(undefined)`
 * valida com sucesso sem nenhum tratamento especial aqui.
 */
export async function apiRequest<T>(
  path: string,
  responseSchema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    // `FormData` (ADM-006, upload de imagem multipart) vai direto como body,
    // sem `JSON.stringify` e sem `Content-Type` manual — o navegador é quem
    // precisa gerar o `multipart/form-data` com o boundary correto; definir
    // `Content-Type` explicitamente aqui quebraria esse boundary.
    headers: options.body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
  });

  const parsedBody = await parseBody(response);

  // Status não-2xx é tratado primeiro, antes de qualquer exigência sobre o
  // corpo ser JSON válido: uma resposta de erro malformada (corpo vazio ou
  // texto não-JSON, ex. "Internal Server Error") nunca deve esconder o
  // status HTTP atrás de um erro genérico de "JSON inválido" — ela vira o
  // mesmo erro genérico por status de `throwApiError`, só sem `code`.
  if (!response.ok) {
    throwApiError(response.status, parsedBody.success ? parsedBody.body : undefined);
  }

  // A partir daqui a resposta é 2xx: só agora "não é JSON válido" é, de
  // fato, um erro de resposta inválida (e não um sintoma de falha já
  // coberta pelo status).
  if (!parsedBody.success) {
    throw new AdminApiError('Resposta da API não é um JSON válido.', {
      statusCode: response.status,
    });
  }

  return parseOrThrow(responseSchema, parsedBody.body, response.status);
}

type ParsedBody = { success: true; body: unknown } | { success: false };

/**
 * Lê o corpo da resposta como texto primeiro (não `response.json()`
 * diretamente) — é o que permite distinguir corpo vazio (`text.length ===
 * 0`, ex.: `204`, tratado como `undefined`, nunca erro) de corpo presente
 * mas não-JSON (`JSON.parse` falha, `success: false`). `response.json()`
 * sozinho não distingue os dois casos (ambos rejeitam a Promise).
 */
async function parseBody(response: Response): Promise<ParsedBody> {
  const text = await response.text();
  if (text.length === 0) {
    return { success: true, body: undefined };
  }

  try {
    return { success: true, body: JSON.parse(text) };
  } catch {
    return { success: false };
  }
}

/**
 * Traduz uma resposta não-2xx para `AdminApiError`. Tenta `apiErrorSchema`
 * (`@commerce-platform/contracts`, CTR-001) primeiro — se o corpo bater,
 * usa `message`/`code` reais da API; caso contrário (corpo ausente, JSON
 * fora do formato esperado, ou texto não-JSON), mensagem genérica
 * carregando o status, sem `code`.
 */
function throwApiError(status: number, body: unknown): never {
  const parsed = apiErrorSchema.safeParse(body);
  throw new AdminApiError(
    parsed.success ? parsed.data.message : `Erro ao chamar a API (status ${status}).`,
    { statusCode: status, code: parsed.success ? parsed.data.code : undefined },
  );
}

/**
 * Valida o corpo de uma resposta 2xx contra o `responseSchema` fornecido
 * por quem chamou `apiRequest`. `code: 'INVALID_RESPONSE_SHAPE'` é fixo
 * (não vem da API) — mesmo critério de `parseOrThrow` em
 * `apps/fastcompre/src/lib/public-api/client.ts`.
 */
function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown, status: number): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AdminApiError('Resposta da API não corresponde ao contrato esperado.', {
      statusCode: status,
      code: 'INVALID_RESPONSE_SHAPE',
      cause: result.error,
    });
  }
  return result.data;
}
