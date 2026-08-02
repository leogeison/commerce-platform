import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Prisma, type Product } from '../../../generated/prisma/client';

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

export interface FindManyBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
  /** `undefined` = sem filtro por Categoria. */
  categoryId?: string;
  /** `undefined` = sem filtro (ativos e arquivados juntos). */
  archived?: boolean;
}

export interface FindManyBySiteResult {
  items: Product[];
  total: number;
}

/**
 * Só os campos que `productOfferSummarySchema` (CTR-004) expõe — `select`,
 * não `include` cru, mesmo critério já usado em `GET /admin/auth/me`
 * (AUTH-008): a Offer completa (`affiliateUrl`, `siteId`, `productId`,
 * `updatedAt` etc.) nunca sai deste método.
 *
 * Ordenação `createdAt asc, id asc` (decisão explícita da CAT-010): ordem
 * de criação, sem inventar uma noção de "mais barata primeiro" ou
 * semelhante — `id` como desempate, mesmo critério de determinismo já
 * usado em `findManyBySite`.
 */
const OFFER_SUMMARY_SELECT = {
  id: true,
  marketplace: true,
  price: true,
  currency: true,
  inStock: true,
  archivedAt: true,
} as const satisfies Prisma.OfferSelect;

/**
 * Tipo explícito do `Product` com o resumo de ofertas selecionado (CAT-010)
 * — via `Prisma.ProductGetPayload`, gerado a partir da própria consulta
 * (`include`/`select` abaixo), sem `as`/cast algum.
 */
export type ProductWithOfferSummaries = Prisma.ProductGetPayload<{
  include: { offers: { select: typeof OFFER_SUMMARY_SELECT } };
}>;

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

  /**
   * Lista paginada de `Product` de um Site (CAT-009). Mesmo padrão de
   * `PrismaCategoryRepository.findManyBySite` (CAT-002): `findMany` +
   * `count` no mesmo `where` via `prisma.$transaction([...])` (mesmo
   * snapshot consistente), ordenação determinística `name asc, id asc`
   * (mesmo critério de desempate).
   *
   * `categoryId` ausente não entra no `where` — sem filtro por Categoria.
   * Presente, filtra exatamente por aquele `categoryId`; se pertencer a
   * outro Site, o `where` combinado com `siteId` simplesmente não bate em
   * nenhum Produto (nenhum Produto daquele Site tem esse `categoryId`) —
   * lista vazia, não erro, sem tratamento especial.
   *
   * `archived` ausente não entra no `where` — ativos e arquivados juntos.
   * Presente, vira `archivedAt: null` (ativos) ou `archivedAt: { not: null }`
   * (arquivados), mesmo critério de Categoria.
   */
  async findManyBySite(
    input: FindManyBySiteInput,
  ): Promise<FindManyBySiteResult> {
    const where: Prisma.ProductWhereInput = {
      siteId: input.siteId,
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      ...(input.archived === undefined
        ? {}
        : { archivedAt: input.archived ? { not: null } : null }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Busca um `Product` por `id`, restrito ao Site, com o resumo de suas
   * `Offer`s (CAT-010). `findUnique` pela chave composta `id_siteId`, mesmo
   * padrão de `PrismaCategoryRepository.findOneBySite` (CAT-003) — um `id`
   * real de Produto de outro Site nunca bate nessa chave, então retorna
   * `null` do mesmo jeito que um `id` inexistente, mesmo `404` genérico.
   *
   * Ofertas arquivadas aparecem no resumo, sem filtro — visão
   * administrativa de detalhe (decisão explícita da CAT-010), mesmo
   * critério de `archivedAt` exposto cru já usado em Categoria/Produto.
   */
  async findOneBySiteWithOffers(
    siteId: string,
    id: string,
  ): Promise<ProductWithOfferSummaries | null> {
    return this.prisma.product.findUnique({
      where: { id_siteId: { id, siteId } },
      include: {
        offers: {
          select: OFFER_SUMMARY_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  /**
   * Arquiva um `Product` do Site (CAT-012, operação **interna** — sem
   * controller/rota HTTP própria; endpoint real é `REV-011`, ainda não
   * implementado). Mesmo padrão de `PrismaCategoryRepository.archiveBySite`
   * (CAT-005): `updateMany` condicionado a `archivedAt: null` (idempotente,
   * não sobrescreve o timestamp original), seguido de `findUnique` na
   * chave composta `id_siteId` — `null` cobre "não existe"/"de outro Site",
   * mesmo critério de isolamento já usado em `findOneBySiteWithOffers`.
   */
  async archiveBySite(siteId: string, id: string): Promise<Product | null> {
    await this.prisma.product.updateMany({
      where: { id, siteId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    return this.prisma.product.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Desarquiva um `Product` do Site (CAT-013, operação **interna** — mesmo
   * critério de `archiveBySite`, invertido). Endpoint real também é
   * `REV-011`.
   */
  async unarchiveBySite(siteId: string, id: string): Promise<Product | null> {
    await this.prisma.product.updateMany({
      where: { id, siteId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    return this.prisma.product.findUnique({
      where: { id_siteId: { id, siteId } },
    });
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
