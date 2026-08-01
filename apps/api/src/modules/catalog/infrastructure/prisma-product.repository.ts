import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { Product } from '../../../generated/prisma/client';

export interface CreateProductInput {
  siteId: string;
  categoryId?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
}

export type CreateProductRepositoryResult =
  | { ok: true; product: Product }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' };

/**
 * Repository concreto (Prisma) de `Product` (CAT-008). `PrismaProductRepository`,
 * mesmo padrão de `PrismaCategoryRepository`/`PrismaUserRepository`: classe
 * concreta dependente do Prisma, sem interface/porta própria.
 *
 * Justificado como abstração pelo mesmo motivo de `PrismaCategoryRepository`:
 * reaproveitado por CAT-008 a CAT-014 (7 casos de uso de Produto). Começa só
 * com `create()`.
 *
 * `create()` traduz dois erros reativamente, sem pré-checagem (mesma
 * estratégia de `PrismaCategoryRepository.create()` — evita corrida entre
 * checar e inserir):
 * - `P2002` (`@@unique([siteId, slug])`) → `SLUG_CONFLICT`;
 * - `P2003` (violação da FK composta `Product.category`, `[categoryId,
 *   siteId] → Category[id, siteId]`, `onDelete: Restrict`) → `CATEGORY_NOT_FOUND`.
 *   Cobre tanto `categoryId` inexistente quanto `categoryId` de uma
 *   Categoria de outro Site — o par `[categoryId, siteId]` só bate se a
 *   Categoria existir *e* pertencer a este Site, mesmo critério de
 *   isolamento já usado em `PrismaCategoryRepository.findOneBySite`.
 *
 * Só essas duas FKs são alcançáveis num `create` normal — a de `siteId` →
 * `Site` nunca falha aqui, porque o Site já foi validado antes pelo
 * `SiteAuthorizationGuard` (o `siteId` usado vem de lá, nunca de entrada
 * não verificada). Qualquer `P2003` neste método é sempre `categoryId`
 * inválido.
 */
@Injectable()
export class PrismaProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateProductInput,
  ): Promise<CreateProductRepositoryResult> {
    try {
      const product = await this.prisma.product.create({
        data: {
          siteId: input.siteId,
          categoryId: input.categoryId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          imageUrl: input.imageUrl,
        },
      });

      return { ok: true, product };
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { ok: false, reason: 'SLUG_CONFLICT' };
      }

      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'CATEGORY_NOT_FOUND' };
      }

      throw err;
    }
  }
}

/**
 * `Product` só tem uma constraint `@unique` alcançável por um `create`
 * (`@@unique([siteId, slug])`; `@@unique([id, siteId])` nunca colide,
 * `id` é gerado). Qualquer `P2002` aqui é conflito de slug.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** `P2003`: violação de foreign key — aqui, `categoryId` inválido/de outro Site. */
function isForeignKeyConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2003'
  );
}
