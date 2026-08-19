import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListPublicCategoriesQuery` do
 * contrato HTTP, mesmo raciocínio já aplicado em `ListPublicArticlesUseCase`
 * (PUB-002): o caso de uso não deve depender do tipo da camada de
 * transporte.
 */
export interface ListPublicCategoriesInput {
  siteId: string;
  page: number;
  pageSize: number;
}

export interface ListPublicCategoriesResult {
  items: Category[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem pública paginada de Categoria não arquivada
 * (UXF-010).
 *
 * Delega a `findManyUnarchivedBySite` — método dedicado do repository que
 * já estrutura `archivedAt: null` no `where` (nunca opcional), mesmo
 * raciocínio de `findManyPublishedBySite`/`ListPublicArticlesUseCase`
 * (PUB-002): a listagem administrativa (`findManyBySite`, CAT-002) aceita
 * `archived?: boolean` opcional porque o admin precisa enxergar as duas
 * situações; a pública nunca deve devolver uma Categoria arquivada, então
 * esse filtro é estrutural do método, não um parâmetro deste caso de uso.
 *
 * `totalPages` calculado aqui, mesmo raciocínio de `ListPublicArticlesUseCase`/
 * `ListCategoriesUseCase`: cálculo puro sobre números já devolvidos pelo
 * repository.
 */
@Injectable()
export class ListPublicCategoriesUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: ListPublicCategoriesInput): Promise<ListPublicCategoriesResult> {
    const { items, total } = await this.categoryRepository.findManyUnarchivedBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
    });

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }
}
