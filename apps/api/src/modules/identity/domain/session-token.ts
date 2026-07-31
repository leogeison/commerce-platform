import { createHmac, randomBytes } from 'node:crypto';

/**
 * Núcleo da sessão opaca (AUTH-003; Architecture.md, Seção 15).
 *
 * Deliberadamente independente de framework: sem import de `@nestjs/*`,
 * sem leitura de `ConfigService`/`process.env`. O segredo entra sempre por
 * parâmetro, resolvido por quem chama (a camada `application/`) — mesmo
 * padrão de "dado já resolvido entra por parâmetro" usado em
 * `tenancy/domain/tenant-context.ts`.
 */

/** 256 bits de entropia — espaço de busca grande o suficiente pra tornar força bruta inviável, independente de qualquer custo de hash. */
const TOKEN_BYTES = 32;

/** Gera um token de sessão aleatório, codificado em base64url (seguro para cookie/URL, sem padding). */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * HMAC-SHA256 do token bruto, usando `SESSION_SECRET` como chave.
 *
 * Não usa Argon2id (AUTH-002) de propósito: aquele algoritmo é lento e
 * memory-hard porque senhas são de baixa entropia (escolhidas por humano).
 * Um token de sessão já nasce com 256 bits de entropia aleatória — força
 * bruta já é inviável com qualquer hash rápido — e este hash é recalculado
 * em toda requisição autenticada (validação de sessão, AUTH-006); um KDF
 * lento aqui custaria dezenas/centenas de ms por requisição sem nenhum
 * ganho real de segurança. Por ser HMAC (chaveado pelo `SESSION_SECRET`,
 * nunca persistido), mesmo um vazamento isolado do banco não expõe tokens
 * válidos nem permite forjar um hash sem o segredo.
 */
export function hashSessionToken(secret: string, rawToken: string): string {
  return createHmac('sha256', secret).update(rawToken).digest('hex');
}
