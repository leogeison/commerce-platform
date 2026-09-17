import { Injectable } from '@nestjs/common';
import {
  CreateCategoryUseCase,
  type CreateCategoryResult,
} from '../../catalog/application/create-category.use-case';
import { RevalidateCategoryUseCase } from './revalidate-category.use-case';

export interface CreateCategoryAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  name: string;
  slug: string;
}

/**
 * Único caminho HTTP que persiste a criação de `Category` (UXF-010A):
 * sempre cria e, em seguida — só em caso de sucesso —, aciona
 * `RevalidateCategoryUseCase`. Cross-domain (Catalog + a coordenação de
 * revalidação), por isso vive em `application`, não em `CatalogModule` —
 * mesmo critério de `UpdateCategoryAndRevalidateUseCase`/
 * `CategoryArchiveAndRevalidateUseCase`.
 *
 * Falha de persistência (`SLUG_CONFLICT`) significa que nada foi criado —
 * `RevalidateCategoryUseCase` nunca é acionada nesse caso.
 */
@Injectable()
export class CreateCategoryAndRevalidateUseCase {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly revalidateCategoryUseCase: RevalidateCategoryUseCase,
  ) {}

  async execute(input: CreateCategoryAndRevalidateInput): Promise<CreateCategoryResult> {
    const result = await this.createCategoryUseCase.execute({
      siteId: input.siteId,
      name: input.name,
      slug: input.slug,
    });

    if (!result.ok) {
      return result;
    }

    await this.revalidateCategoryUseCase.execute({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      categoryId: result.category.id,
    });

    return result;
  }
}
