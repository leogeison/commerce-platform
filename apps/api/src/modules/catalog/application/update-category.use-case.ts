import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

export interface UpdateCategoryInput {
  siteId: string;
  id: string;
  name?: string;
  slug?: string;
}

export type UpdateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'SLUG_CONFLICT' };

/**
 * Caso de uso INTERNO de atualização de Categoria (CAT-004) — sem
 * controller próprio (Architecture.md: "as operações de domínio
 * correspondentes... deixam de ter controller HTTP próprio"). Não conhece
 * autorização, `TenantContext`, revalidação nem `REV-005` — só persiste.
 * Só é chamável pelo orquestrador HTTP-facing que expõe
 * `PATCH /admin/sites/:siteSlug/categories/:id` (REV-009), e só depois de
 * suas próprias guards/`@MinRole` já terem autorizado a requisição.
 *
 * Só delega ao repository — sem regra de negócio adicional além do que já
 * está descrito em `PrismaCategoryRepository.updateBySite` (identidade por
 * `id + siteId`, sem condição de estado, `archivedAt` sempre preservado).
 */
@Injectable()
export class UpdateCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: UpdateCategoryInput): Promise<UpdateCategoryResult> {
    return this.categoryRepository.updateBySite(input);
  }
}
