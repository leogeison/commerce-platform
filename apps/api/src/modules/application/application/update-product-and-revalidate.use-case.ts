import { Injectable } from '@nestjs/common';
import {
  UpdateProductUseCase,
  type UpdateProductResult,
} from '../../catalog/application/update-product.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';

export interface UpdateProductAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  productId: string;
  name?: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

/**
 * Único caminho HTTP que persiste alterações de `Product`: sempre
 * atualiza e, em seguida — só em caso de sucesso —, aciona a coordenação de
 * revalidação para os Artigos publicados afetados. Cross-domain (Catalog +
 * a coordenação de revalidação), por isso vive em `application`, não em
 * `CatalogModule`.
 *
 * Sem `try/catch`/`Logger` própria — mesma razão de
 * `UpdateCategoryAndRevalidateUseCase`: `RevalidateAffectedArticlesUseCase`
 * já garante, por contrato, que toda falha (descoberta via APP-005 ou
 * revalidação via REV-002) é capturada e logada internamente, e que
 * `Promise<void>` sempre resolve. Falha de persistência (`NOT_FOUND`/
 * `SLUG_CONFLICT`/`CATEGORY_NOT_FOUND`) significa que nada mudou — a
 * coordenação de revalidação nunca é acionada nesse caso.
 */
@Injectable()
export class UpdateProductAndRevalidateUseCase {
  constructor(
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async execute(input: UpdateProductAndRevalidateInput): Promise<UpdateProductResult> {
    const result = await this.updateProductUseCase.execute({
      siteId: input.siteId,
      id: input.productId,
      name: input.name,
      slug: input.slug,
      categoryId: input.categoryId,
      description: input.description,
      imageUrl: input.imageUrl,
    });

    if (!result.ok) {
      return result;
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForProduct({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      productId: input.productId,
    });

    return result;
  }
}
