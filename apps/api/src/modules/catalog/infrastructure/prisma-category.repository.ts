import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Prisma, type Category } from '../../../generated/prisma/client';

export interface CreateCategoryInput {
  siteId: string;
  name: string;
  slug: string;
}

export type CreateCategoryRepositoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'SLUG_CONFLICT' };

export interface FindManyBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
  /** `undefined` = sem filtro (ativas e arquivadas juntas). */
  archived?: boolean;
}

export interface FindManyBySiteResult {
  items: Category[];
  total: number;
}

/**
 * Repository concreto (Prisma) de `Category` (CAT-001). `PrismaCategoryRepository`,
 * não `CategoryRepository` — mesmo padrão do `PrismaUserRepository` (AUTH-001):
 * classe concreta dependente do Prisma, sem interface/porta própria, já que
 * só existe uma implementação plausível hoje.
 *
 * Justificado como abstração (diferente de guards de consumidor único, ex.
 * AUTH-006): reaproveitado por CAT-001 a CAT-007 (7 casos de uso), todos
 * precisando das mesmas consultas escopadas por `siteId`. Começa só com
 * `create()` — os demais métodos entram junto com a tarefa que precisar.
 *
 * Traduz a violação de unicidade do Prisma (`P2002`, `@@unique([siteId,
 * slug])`) para um resultado tipado `{ ok: false, reason: 'SLUG_CONFLICT' }`
 * — quem chama (`CreateCategoryUseCase`) nunca precisa saber que a
 * persistência é Prisma nem o que é um código `P2002`, só que a criação
 * pode falhar por conflito de slug. Estratégia reativa (tenta criar, captura
 * o erro) em vez de checar existência antes: evita condição de corrida
 * entre duas requisições concorrentes com o mesmo slug.
 */
@Injectable()
export class PrismaCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateCategoryInput,
  ): Promise<CreateCategoryRepositoryResult> {
    try {
      const category = await this.prisma.category.create({
        data: {
          siteId: input.siteId,
          name: input.name,
          slug: input.slug,
        },
      });

      return { ok: true, category };
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { ok: false, reason: 'SLUG_CONFLICT' };
      }

      throw err;
    }
  }

  /**
   * Lista paginada de `Category` de um Site (CAT-002).
   *
   * `findMany` + `count` no mesmo `where` via `prisma.$transaction([...])`:
   * as duas consultas veem o mesmo snapshot consistente do banco (evita
   * `total` e `items` divergirem se uma escrita concorrente acontecer entre
   * as duas chamadas separadas).
   *
   * `archived` ausente não entra no `where` — nenhum filtro por
   * `archivedAt`, retorna ativas e arquivadas juntas. Presente, vira
   * `archivedAt: null` (ativas) ou `archivedAt: { not: null }` (arquivadas).
   *
   * Ordenação determinística `name asc, id asc` (decisão explícita da
   * CAT-002): `id` como desempate evita ordem instável quando dois nomes
   * coincidem — sem ele, a ordem relativa entre linhas de nome igual não é
   * garantida pelo Postgres.
   */
  async findManyBySite(
    input: FindManyBySiteInput,
  ): Promise<FindManyBySiteResult> {
    const where: Prisma.CategoryWhereInput = {
      siteId: input.siteId,
      ...(input.archived === undefined
        ? {}
        : { archivedAt: input.archived ? { not: null } : null }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Busca uma `Category` por `id`, restrita ao Site (CAT-003).
   *
   * `findUnique` pela chave composta `id_siteId` (gerada pelo Prisma a
   * partir de `@@unique([id, siteId])` do schema) — mais direto que
   * `findFirst({ where: { id, siteId } })` para uma busca por identidade
   * única, e usa o mesmo índice da constraint. Um `id` real de Categoria
   * de outro Site nunca bate nessa chave composta (o par `id_siteId` não
   * existe), então retorna `null` do mesmo jeito que um `id` inexistente
   * — quem chama nunca distingue os dois casos, sempre um `404` genérico
   * (decisão explícita da CAT-003, mesmo raciocínio de isolamento já usado
   * na AUTH-010).
   */
  async findOneBySite(siteId: string, id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }
}

/**
 * `Category` só tem uma constraint `@unique` alcançável por um `create`
 * (`@@unique([siteId, slug])`; `@@unique([id, siteId])` nunca colide num
 * `create` normal, `id` é gerado). Qualquer `P2002` aqui é conflito de
 * slug.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
