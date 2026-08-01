import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListCategoriesQuery` do contrato
 * HTTP (`packages/contracts`). Mesmo raciocínio já aplicado em
 * `CreateCategoryUseCase`: o caso de uso não deve depender do tipo da
 * camada de transporte; o controller é quem traduz `ListCategoriesQuery`
 * (já validado pelo `ZodValidationPipe`) para este input.
 */
export interface ListCategoriesInput {
  siteId: string;
  page: number;
  pageSize: number;
  archived?: boolean;
}

export interface ListCategoriesResult {
  items: Category[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem paginada de Categoria (CAT-002).
 *
 * `totalPages` calculado aqui, não no repository nem na apresentação:
 * `Math.ceil(total / pageSize)` é cálculo puro sobre números que o
 * repository já devolveu, não conhecimento de Prisma (não pertence ao
 * repository) nem formatação de resposta HTTP (não pertence ao
 * presenter/`category.presenter.ts`, que só converte `Date` → ISO por
 * item). `total === 0` sempre resulta em `totalPages: 0` (não `NaN`, já
 * que `Math.ceil(0 / pageSize) === 0` para qualquer `pageSize > 0`).
 */
@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: ListCategoriesInput): Promise<ListCategoriesResult> {
    const { items, total } = await this.categoryRepository.findManyBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
      archived: input.archived,
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
