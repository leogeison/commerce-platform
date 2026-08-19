import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Prisma, type Category } from '../../../generated/prisma/client';
import { isForeignKeyConstraintViolation } from '../../../shared/database/prisma-error.util';

export interface CreateCategoryInput {
  siteId: string;
  name: string;
  slug: string;
}

export type CreateCategoryRepositoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'SLUG_CONFLICT' };

export type DeleteCategoryRepositoryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_PRODUCTS' };

export interface UpdateCategoryInput {
  siteId: string;
  id: string;
  name?: string;
  slug?: string;
}

export type UpdateCategoryRepositoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'NOT_FOUND' }
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

export interface FindManyUnarchivedBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
}

export interface FindManyUnarchivedBySiteResult {
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
   * Lista paginada de `Category` NÃO arquivada de um Site (UXF-010) —
   * método dedicado para a listagem pública
   * (`GET /public/sites/:siteSlug/categories`), separado de
   * `findManyBySite`.
   *
   * `findManyBySite` (CAT-002, acima) aceita `archived?: boolean`
   * *opcional* porque a listagem administrativa precisa enxergar ativas e
   * arquivadas conforme o filtro escolhido no admin. A pública nunca deve
   * devolver uma Categoria arquivada — por isso `archivedAt: null` é
   * estrutural neste método (sempre no `where`, nunca um parâmetro), em vez
   * de reutilizar `findManyBySite(..., archived: false)` e depender de quem
   * chama lembrar de passar esse filtro. Mesmo raciocínio de
   * `findManyPublishedBySite`/`PrismaArticleRepository` (PUB-002): o
   * invariante público vive no método do repository, não numa flag opcional
   * compartilhada com o admin.
   *
   * `findMany` + `count` no mesmo `where` via `prisma.$transaction([...])`
   * e ordenação `name asc, id asc`: mesma técnica e mesmo raciocínio de
   * `findManyBySite` — `id asc` aqui é só desempate determinístico interno
   * (evita ordem instável quando dois nomes coincidem); o contrato público
   * normativo desta listagem é apenas `name asc`.
   */
  async findManyUnarchivedBySite(
    input: FindManyUnarchivedBySiteInput,
  ): Promise<FindManyUnarchivedBySiteResult> {
    const where: Prisma.CategoryWhereInput = {
      siteId: input.siteId,
      archivedAt: null,
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

  /**
   * Busca uma `Category` por `slug`, restrita ao Site (PUB-004; Architecture.md
   * §31) — leitura pública, sem sessão.
   *
   * `findFirst` (não `findUnique`): `Category` não tem `@@unique([id,
   * slug])`/chave composta por `slug`, só `@@unique([siteId, slug])` —
   * `findFirst({ where: { siteId, slug } })` é a forma correta de buscar
   * por essa combinação sem uma chave composta nomeada pelo Prisma (mesmo
   * raciocínio de `findManyPublishedBySite`, PUB-002, que também usa
   * `where` livre em vez de `findUnique`).
   *
   * Sem filtro de `archivedAt` — decisão explícita da PUB-004: uma
   * Categoria arquivada continua resolvível pela API pública. Arquivar
   * impede uso administrativo futuro (novos vínculos, Architecture.md §12),
   * mas não invalida referências históricas já presentes em Artigo
   * `PUBLISHED` — se um Artigo público ainda expõe aquele `categorySlug`
   * (PUB-002/PUB-003, que também não filtram `archivedAt` da Categoria),
   * este endpoint não pode virar `404` só por causa do arquivamento.
   *
   * Um `slug` que existe em outro Site nunca bate no `where` (`siteId`
   * também exigido) — mesmo `null` genérico de "não existe", quem chama
   * nunca distingue os dois casos (mesmo critério de `findOneBySite`).
   */
  async findOneBySlug(siteId: string, slug: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { siteId, slug },
    });
  }

  /**
   * Atualiza uma `Category` do Site (CAT-004) — operação INTERNA, sem
   * controller próprio: só `UpdateCategoryUseCase` a chama, que por sua vez
   * só é chamado pelo orquestrador HTTP-facing que também aciona a
   * coordenação de revalidação (REV-009).
   *
   * `prisma.category.update` direto pela chave composta `id_siteId`, sem
   * `updateMany`-condicionado: diferente de `Article`, `Category` não tem
   * máquina de estados nem regra de "só editável em tal status" — a única
   * condição de elegibilidade é a própria identidade (`id + siteId`).
   * Categoria arquivada é atualizável normalmente: nenhum filtro de
   * `archivedAt` no `where`, e como `archivedAt` nunca entra no `data`
   * abaixo, seu valor é sempre preservado, arquivada ou não.
   *
   * Mesma estratégia reativa de `create()`/`deleteBySite()`: tenta a
   * escrita direto e traduz o erro do Postgres/Prisma, em vez de checar e
   * escrever em dois passos. `P2025` (a chave composta não bateu — Categoria
   * inexistente ou de outro Site, mesmo critério de isolamento de
   * `findOneBySite`/`deleteBySite`) → `NOT_FOUND`. `P2002` (`@@unique([siteId,
   * slug])`) → `SLUG_CONFLICT`, mesma tradução de `create()`.
   */
  async updateBySite(input: UpdateCategoryInput): Promise<UpdateCategoryRepositoryResult> {
    try {
      const category = await this.prisma.category.update({
        where: { id_siteId: { id: input.id, siteId: input.siteId } },
        data: {
          name: input.name,
          slug: input.slug,
        },
      });

      return { ok: true, category };
    } catch (err) {
      if (isRecordNotFound(err)) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      if (isUniqueConstraintViolation(err)) {
        return { ok: false, reason: 'SLUG_CONFLICT' };
      }

      throw err;
    }
  }

  /**
   * Arquiva uma `Category` do Site (CAT-005). Idempotente sem sobrescrever
   * `archivedAt`: o `updateMany` só afeta a linha quando `id + siteId`
   * batem **e** `archivedAt` ainda é `null` — arquivar uma Categoria já
   * arquivada não toca a linha (0 registros afetados), preservando o
   * timestamp original do primeiro arquivamento. O `findUnique` seguinte
   * pela chave composta `id_siteId` devolve o estado atual (recém-arquivado
   * ou já arquivado antes, tanto faz) — ou `null` se `id + siteId` não
   * corresponderem a nenhuma Categoria (inexistente ou de outro Site, mesmo
   * `404` genérico da CAT-003).
   */
  async archiveBySite(siteId: string, id: string): Promise<Category | null> {
    await this.prisma.category.updateMany({
      where: { id, siteId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    return this.prisma.category.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Desarquiva uma `Category` do Site (CAT-006). Mesmo raciocínio de
   * `archiveBySite`, invertido: o `updateMany` só afeta a linha quando
   * `archivedAt` ainda não é `null` — desarquivar uma Categoria já ativa
   * não toca a linha, e o `findUnique` devolve o estado atual (`archivedAt:
   * null`) de qualquer forma.
   */
  async unarchiveBySite(siteId: string, id: string): Promise<Category | null> {
    await this.prisma.category.updateMany({
      where: { id, siteId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    return this.prisma.category.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Exclui fisicamente uma `Category` do Site (CAT-007) — operação
   * **interna** do Catalog, sem controller/rota HTTP própria; quem chama é
   * `APP-006` (cross-domain, fora deste módulo), depois de já ter
   * confirmado que não há Artigo vinculado.
   *
   * Reativa, sem pré-checagem de Produto vinculado — mesmo raciocínio já
   * usado em `create()` para conflito de slug: tenta o `delete` direto pela
   * chave composta `id_siteId` e traduz o erro do Postgres/Prisma, em vez
   * de checar e excluir em dois passos (evita corrida entre checar
   * "nenhum Produto vinculado" e um Produto ser criado logo depois, antes
   * da exclusão de fato acontecer).
   *
   * `Product.category` é `onDelete: Restrict` no schema — o próprio
   * Postgres recusa a exclusão se existir Produto vinculado, e o Prisma
   * traduz isso para `P2003` (violação de foreign key). Já `P2025` é
   * "registro não encontrado" — cobre tanto `id` inexistente quanto `id`
   * de outra Categoria (a chave composta `id_siteId` nunca bate), mesmo
   * critério de isolamento já usado em `findOneBySite`.
   */
  async deleteBySite(
    siteId: string,
    id: string,
  ): Promise<DeleteCategoryRepositoryResult> {
    try {
      await this.prisma.category.delete({
        where: { id_siteId: { id, siteId } },
      });

      return { ok: true };
    } catch (err) {
      if (isRecordNotFound(err)) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'HAS_PRODUCTS' };
      }

      throw err;
    }
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

/** `P2025`: operação (aqui, `delete`) não encontrou o registro pela `where`. */
function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2025'
  );
}
