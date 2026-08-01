import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso, não o `CategoryParams` do contrato HTTP —
 * mesmo raciocínio já aplicado em `ArchiveCategoryUseCase`.
 */
export interface UnarchiveCategoryInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de desarquivamento de Categoria (CAT-006). Espelha
 * `ArchiveCategoryUseCase`: delega ao repository, `null` cobre "não
 * existe"/"de outro Site", idempotência é responsabilidade do
 * `PrismaCategoryRepository.unarchiveBySite`.
 */
@Injectable()
export class UnarchiveCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: UnarchiveCategoryInput): Promise<Category | null> {
    return this.categoryRepository.unarchiveBySite(input.siteId, input.id);
  }
}
