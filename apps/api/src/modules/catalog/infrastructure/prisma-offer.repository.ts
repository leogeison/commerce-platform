import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { Marketplace, Offer } from '../../../generated/prisma/client';

export interface CreateOfferInput {
  siteId: string;
  productId: string;
  marketplace: Marketplace;
  price: string;
  currency?: string;
  affiliateUrl: string;
  inStock?: boolean;
}

export type CreateOfferRepositoryResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

/**
 * Repository concreto (Prisma) de `Offer` (CAT-015). `PrismaOfferRepository`,
 * mesmo padrão de `PrismaProductRepository`/`PrismaCategoryRepository`:
 * classe concreta dependente do Prisma, sem interface/porta própria.
 *
 * Justificado como abstração pelo mesmo motivo dos outros dois: reaproveitado
 * por CAT-015 a CAT-021 (7 casos de uso de Oferta). Começa só com `create()`.
 *
 * Sem conflito de unicidade: `Offer` só tem `@@unique([id, siteId])`
 * (estrutural, nunca colide num `create` normal, `id` é gerado) — nenhuma
 * constraint de negócio alcançável aqui. Architecture.md confirma
 * explicitamente: "Um Produto pode ter múltiplas Ofertas, inclusive do
 * mesmo marketplace." Só existe um erro possível neste método.
 *
 * `create()` traduz reativamente, sem pré-checagem (mesma estratégia já
 * usada em `PrismaProductRepository.create()` para `categoryId` — evita
 * corrida entre checar e inserir):
 * - `P2003` (violação da FK composta `Offer.product`, `[productId,
 *   siteId] → Product[id, siteId]`, `onDelete: Restrict`) → `PRODUCT_NOT_FOUND`.
 *   Cobre tanto `productId` inexistente quanto `productId` de um Produto
 *   de outro Site — o par `[productId, siteId]` só bate se o Produto
 *   existir *e* pertencer a este Site, mesmo critério de isolamento já
 *   usado em Categoria/Produto.
 *
 * Só essa FK é alcançável num `create` normal — a de `siteId` → `Site`
 * nunca falha aqui, porque o Site já foi validado antes pelo
 * `SiteAuthorizationGuard`.
 */
@Injectable()
export class PrismaOfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOfferInput): Promise<CreateOfferRepositoryResult> {
    try {
      const offer = await this.prisma.offer.create({
        data: {
          siteId: input.siteId,
          productId: input.productId,
          marketplace: input.marketplace,
          price: input.price,
          affiliateUrl: input.affiliateUrl,
          // `currency`/`inStock` omitidos do objeto `data` quando ausentes
          // (não `key: undefined`) — o schema Prisma já tem `@default`
          // para os dois (`"BRL"`/`true`); omitir a chave deixa o
          // Postgres/Prisma aplicar o default sozinho, sem duplicar esse
          // valor aqui.
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.inStock !== undefined ? { inStock: input.inStock } : {}),
        },
      });

      return { ok: true, offer };
    } catch (err) {
      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
      }

      throw err;
    }
  }
}

/** `P2003`: violação de foreign key — aqui, `productId` inválido/de outro Site. */
function isForeignKeyConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2003'
  );
}
