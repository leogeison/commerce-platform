import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso, não o `CategoryParams` do contrato HTTP —
 * mesmo raciocínio já aplicado em `GetCategoryUseCase`/`CreateCategoryUseCase`.
 */
export interface ArchiveCategoryInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de arquivamento de Categoria (CAT-005).
 *
 * Só delega ao repository e devolve `Category | null` — `null` cobre tanto
 * "não existe" quanto "é de outro Site", sem distinção (mesmo critério da
 * CAT-003). A idempotência (arquivar uma Categoria já arquivada não altera
 * `archivedAt`) é responsabilidade do `PrismaCategoryRepository.archiveBySite`,
 * não deste caso de uso.
 */
@Injectable()
export class ArchiveCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: ArchiveCategoryInput): Promise<Category | null> {
    return this.categoryRepository.archiveBySite(input.siteId, input.id);
  }
}
