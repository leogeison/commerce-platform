/**
 * UXP-006 — limites de entrada do registro de clique.
 *
 * Os valores vêm da URL pública do redirecionador (`utm_*`) e de cabeçalhos
 * HTTP (`User-Agent`, `Referer`) — controlados por quem faz a requisição.
 * Nunca REJEITAM a requisição (o redirecionamento não pode falhar por isso):
 * só normalizam o que é gravado.
 *
 * - UTMs: no máximo 200 caracteres (code points, sem quebrar pares
 *   substitutos); string vazia vira `null`. Sem marcador de truncamento —
 *   o valor gravado é o prefixo.
 * - User-Agent: no máximo 512 caracteres, mesma regra. Usado só para
 *   classificação derivada (dispositivo, provável bot); nunca exibido bruto.
 * - Referer: reduzido a `origem + caminho` (sem query string nem fragmento,
 *   onde costumam aparecer identificadores e dados pessoais), no máximo 512
 *   caracteres; valor que não seja URL http(s) válida vira `null`. Nunca
 *   exibido na interface nem exportado.
 */
export const UTM_MAX_LENGTH = 200;
export const USER_AGENT_MAX_LENGTH = 512;
export const REFERER_MAX_LENGTH = 512;

export function truncateCodePoints(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const codePoints = Array.from(value);
  return codePoints.length <= maxLength ? value : codePoints.slice(0, maxLength).join('');
}

export function sanitizeReferer(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return truncateCodePoints(`${url.origin}${url.pathname}`, REFERER_MAX_LENGTH);
  } catch {
    return null;
  }
}
