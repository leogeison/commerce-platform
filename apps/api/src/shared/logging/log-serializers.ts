/**
 * Serializers de `req`/`res` dos logs estruturados (PROD-003).
 *
 * O `pino-http` (com `wrapSerializers`, o default) aplica primeiro o
 * serializer padrão do `pino-std-serializers` e só então estes — por isso
 * eles recebem o objeto já serializado (`{ id, method, url, query, params,
 * headers, remoteAddress, remotePort }` / `{ statusCode, headers }`) e
 * apenas filtram.
 *
 * Allowlist, nunca denylist: só sai o que está listado aqui. Qualquer outro
 * campo ou header — `cookie` (token de sessão), `authorization`,
 * `set-cookie`, `location` (URL de afiliado), `x-real-ip`,
 * `x-forwarded-for`, `x-revalidation-secret`, `referer`, ou qualquer header
 * futuro — fica fora do log por construção. `remoteAddress`, `remotePort` e
 * `query` também ficam fora: nenhum IP de cliente vai para o log
 * (`Architecture.md` §8/§12), e `url` é reduzida ao pathname (sem query
 * string nem fragmento).
 *
 * Como o `req` é vinculado via `logger.child({ req })` em cada requisição,
 * estes serializers também valem para todo log da aplicação emitido dentro
 * dela (ex.: `AllExceptionsFilter`, falhas de revalidação).
 */

export const REQUEST_HEADER_ALLOWLIST = [
  'host',
  'user-agent',
  'content-type',
  'content-length',
  'x-request-id',
] as const;

export const RESPONSE_HEADER_ALLOWLIST = [
  'content-type',
  'content-length',
  'x-request-id',
] as const;

type HeaderValue = string | number | string[] | undefined;

type HeaderMap = Record<string, HeaderValue>;

export interface SerializedRequestInput {
  id?: unknown;
  method?: string;
  url?: string;
  params?: unknown;
  headers?: HeaderMap;
}

export interface SerializedResponseInput {
  statusCode?: number | null;
  headers?: HeaderMap;
}

/**
 * Copia só os headers da allowlist. Header ausente não aparece; array é
 * copiado como está se o nome é permitido; a comparação de nome é feita em
 * minúsculas (o Node já entrega nomes em minúsculas — isto é só defesa).
 */
export function pickAllowedHeaders(
  headers: HeaderMap | undefined,
  allowlist: readonly string[],
): HeaderMap {
  const picked: HeaderMap = {};

  if (!headers) {
    return picked;
  }

  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();

    if (value !== undefined && allowlist.includes(normalizedName)) {
      picked[normalizedName] = value;
    }
  }

  return picked;
}

/**
 * Só o pathname: query string e fragmento são removidos, para que nenhum
 * valor sensível enviado na query (acidental ou maliciosamente) chegue ao log.
 */
export function toLoggablePath(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }

  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export function serializeRequest(req: SerializedRequestInput) {
  return {
    id: req.id,
    method: req.method,
    url: toLoggablePath(req.url),
    params: req.params,
    headers: pickAllowedHeaders(req.headers, REQUEST_HEADER_ALLOWLIST),
  };
}

export function serializeResponse(res: SerializedResponseInput) {
  return {
    statusCode: res.statusCode,
    headers: pickAllowedHeaders(res.headers, RESPONSE_HEADER_ALLOWLIST),
  };
}
