import { Injectable } from '@nestjs/common';
import {
  UpdateCategoryUseCase,
  type UpdateCategoryResult,
} from '../../catalog/application/update-category.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';

export interface UpdateCategoryAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  categoryId: string;
  name?: string;
  slug?: string;
}

/**
 * Único caminho HTTP que persiste alterações de `Category`: sempre
 * atualiza e, em seguida — só em caso de sucesso —, aciona a coordenação de
 * revalidação para os Artigos publicados afetados. Cross-domain (Catalog +
 * a coordenação de revalidação), por isso vive em `application`, não em
 * `CatalogModule`.
 *
 * Sem `try/catch`/`Logger` própria: `RevalidateAffectedArticlesUseCase` já
 * garante, por contrato, que toda falha (descoberta via APP-005 ou
 * revalidação via REV-002) é capturada e logada internamente, e que
 * `Promise<void>` sempre resolve — duplicar esse tratamento aqui
 * reimplementaria uma responsabilidade que já não é deste orquestrador.
 * Falha de persistência (`NOT_FOUND`/`SLUG_CONFLICT`), por outro lado,
 * significa que nada mudou — a coordenação de revalidação nunca é
 * acionada nesse caso.
 */
@Injectable()
export class UpdateCategoryAndRevalidateUseCase {
  constructor(
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async execute(input: UpdateCategoryAndRevalidateInput): Promise<UpdateCategoryResult> {
    const result = await this.updateCategoryUseCase.execute({
      siteId: input.siteId,
      id: input.categoryId,
      name: input.name,
      slug: input.slug,
    });

    if (!result.ok) {
      return result;
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForCategory({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      categoryId: input.categoryId,
    });

    return result;
  }
}
