import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { Category } from '../../../generated/prisma/client';

export interface CreateCategoryInput {
  siteId: string;
  name: string;
  slug: string;
}

export type CreateCategoryRepositoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'SLUG_CONFLICT' };

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
