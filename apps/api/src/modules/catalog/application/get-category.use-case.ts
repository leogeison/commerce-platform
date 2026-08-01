import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso (não o `CategoryParams` do contrato HTTP) —
 * mesmo raciocínio já aplicado em `CreateCategoryUseCase`/`ListCategoriesUseCase`.
 */
export interface GetCategoryInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de detalhe de Categoria (CAT-003).
 *
 * Só delega ao repository e devolve `Category | null` — "não encontrado" e
 * "pertence a outro Site" chegam aqui como o mesmo `null` (o repository já
 * não distingue os dois casos), e o caso de uso não inventa uma
 * distinção que não existe. Quem decide que `null` vira `404 Not Found` é
 * o controller (camada HTTP), não este caso de uso.
 */
@Injectable()
export class GetCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: GetCategoryInput): Promise<Category | null> {
    return this.categoryRepository.findOneBySite(input.siteId, input.id);
  }
}
