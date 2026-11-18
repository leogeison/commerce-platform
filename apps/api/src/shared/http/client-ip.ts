import { isIP } from 'node:net';
import type { Request } from 'express';
import type { EnvVars } from '../config/env.schema';

/**
 * Origem do IP do cliente usado como chave de rate limit (PROD-002).
 *
 * - `socket` (default): endereço da conexão TCP (`request.ip` →
 *   `request.socket.remoteAddress` → `'unknown'`), exatamente o
 *   comportamento anterior. Qualquer header de proxy é ignorado.
 * - `x-real-ip`: lê o header `X-Real-IP`, só quando a API roda atrás de um
 *   proxy que controla esse valor (Railway). Selecionado explicitamente por
 *   `CLIENT_IP_SOURCE`, nunca detectado automaticamente.
 *
 * Valores fechados de propósito (enum de `env.schema.ts`): nenhum nome
 * arbitrário de header é aceito.
 */
export type ClientIpSource = EnvVars['CLIENT_IP_SOURCE'];

const X_REAL_IP_HEADER = 'x-real-ip';

function resolveSocketIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

/**
 * Aceita somente um único IPv4/IPv6 válido após `trim()`. Header ausente,
 * array (header repetido), lista separada por vírgula ou qualquer valor que
 * não seja um IP retornam `undefined` — o chamador cai no fallback do socket.
 */
function parseSingleIp(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const candidate = value.trim();

  return isIP(candidate) === 0 ? undefined : candidate;
}

export function resolveClientIp(request: Request, source: ClientIpSource): string {
  if (source === 'x-real-ip') {
    const headerIp = parseSingleIp(request.headers[X_REAL_IP_HEADER]);

    if (headerIp !== undefined) {
      return headerIp;
    }
  }

  return resolveSocketIp(request);
}
