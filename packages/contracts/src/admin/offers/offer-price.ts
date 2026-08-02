import { z } from 'zod';

/**
 * Formato de preço monetário (CTR-005) — string com ponto decimal, no
 * máximo duas casas, valor `> 0` (Architecture.md, Seção "Oferta": "Preço
 * deve ser um valor positivo (`> 0`)"). Extraído para arquivo próprio
 * porque é reaproveitável além do request de criação (ex.: campos de
 * preço futuros, histórico de preço).
 *
 * String, nunca `number`: `Offer.price` é `Decimal(10,2)` no Postgres —
 * `number` do JS arriscaria perda de precisão em valor monetário (mesma
 * decisão já usada na resposta da CTR-004, agora estendida ao request).
 * Nunca convertido para `number` na persistência — a própria string é
 * salva; `Number()` só entra na validação de `> 0` abaixo.
 *
 * Regex exige dígitos antes do ponto, opcionalmente até 2 casas decimais
 * depois — sem vírgula, sem notação científica. `Decimal(10,2)` trunca
 * casas extras silenciosamente; preferimos rejeitar na entrada a aceitar e
 * truncar sem avisar.
 */
export const offerPriceSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Preço deve ser um número com até duas casas decimais.')
  .refine((value) => Number(value) > 0, 'Preço deve ser maior que zero.');

export type OfferPrice = z.infer<typeof offerPriceSchema>;
