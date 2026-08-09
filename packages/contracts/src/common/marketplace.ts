import { z } from 'zod';

/**
 * Marketplaces suportados por uma `Offer` (schema Prisma, `enum Marketplace`,
 * `apps/api/prisma/schema.prisma`). Os quatro valores abaixo são os
 * exatamente definidos lá — nenhum inventado aqui.
 *
 * Movido de `admin/common/` para cá na PUB-001 (CTR-010): passou a ter
 * consumidor real fora da superfície `admin` (`public/articles`, via
 * `publicOfferSchema`), então a dependência correta é
 * `admin → common ← public`, nunca `public → admin`. Mesma forma e mesmo
 * nome exportado de antes — só o local mudou.
 */
export const marketplaceSchema = z.enum([
  'MERCADO_LIVRE',
  'AMAZON_BR',
  'AMAZON_INTL',
  'ALIEXPRESS',
]);

export type Marketplace = z.infer<typeof marketplaceSchema>;
