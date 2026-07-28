import { z } from 'zod';

/**
 * Formato de erro único para toda a API (Architecture.md, seção 26).
 *
 * `code` é o campo estável que o frontend deve usar para decidir
 * comportamento (nunca comparar `message`, que é texto livre para exibição
 * e pode mudar). Cada módulo de domínio define seus próprios valores de
 * `code`; este contrato só fixa o formato do envelope, não o universo de
 * códigos possíveis — por isso `code` é `string`, não um enum fechado.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  error: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
