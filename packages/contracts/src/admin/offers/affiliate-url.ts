import { z } from 'zod';

const VALID_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * URL de afiliado (CTR-005) — obrigatória, formato de URL válido,
 * protocolo HTTP ou HTTPS, sem verificação externa automática
 * (Architecture.md, Seção "Oferta"). Extraído para arquivo próprio porque
 * é reaproveitável além do request de criação (ex.: futura atualização de
 * Oferta, CAT-018).
 *
 * `z.string().url()` garante o formato geral de URL; o `.refine` seguinte
 * usa `new URL(value).protocol` para checar o protocolo real — não um
 * prefixo de string (`startsWith('http')` aceitaria `httpx://`).
 *
 * `try/catch` dentro do `.refine`: o Zod não interrompe a cadeia de checks
 * quando `.url()` falha (por padrão, roda todos os checks e agrega os
 * erros, não para no primeiro) — sem o `try/catch`, um valor que já falhou
 * em `.url()` (ex.: `"not-a-url"`) chegaria aqui e `new URL(value)`
 * lançaria uma exceção não tratada, derrubando a validação inteira em vez
 * de virar mais um issue do Zod. Confirmado via teste manual antes de
 * seguir.
 */
export const affiliateUrlSchema = z
  .string()
  .url('affiliateUrl deve ser uma URL válida.')
  .refine((value) => {
    try {
      return VALID_PROTOCOLS.has(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'affiliateUrl deve usar protocolo http ou https.');

export type AffiliateUrl = z.infer<typeof affiliateUrlSchema>;
