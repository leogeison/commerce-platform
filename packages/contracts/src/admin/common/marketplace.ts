import { z } from 'zod';

/**
 * Marketplaces suportados por uma `Offer` (schema Prisma, `enum Marketplace`,
 * `apps/api/prisma/schema.prisma`). Os quatro valores abaixo são os
 * exatamente definidos lá — nenhum inventado aqui.
 *
 * Fica em `admin/common/`, não em `admin/products/` nem `admin/offers/`,
 * porque é reaproveitado por mais de uma superfície administrativa:
 * `productOfferSummarySchema` (CTR-004, resumo de Oferta no detalhe de
 * Produto) e a futura CTR-005 (`admin/offers`, contrato completo de
 * Oferta) — nenhuma das duas duplica o enum, as duas importam daqui.
 */
export const marketplaceSchema = z.enum([
  'MERCADO_LIVRE',
  'AMAZON_BR',
  'AMAZON_INTL',
  'ALIEXPRESS',
]);

export type Marketplace = z.infer<typeof marketplaceSchema>;
