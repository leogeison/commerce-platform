import { Injectable } from '@nestjs/common';
import {
  UpdateCategoryUseCase,
  type UpdateCategoryResult,
} from '../../catalog/application/update-category.use-case';
import { RevalidateCategoryUseCase } from './revalidate-category.use-case';

export interface UpdateCategoryAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  categoryId: string;
  name?: string;
  slug?: string;
}

/**
 * Único caminho HTTP que persiste alterações de `Category`: sempre
 * atualiza e, em seguida — só em caso de sucesso —, aciona
 * `RevalidateCategoryUseCase` (UXF-010A). Cross-domain (Catalog + a
 * coordenação de revalidação), por isso vive em `application`, não em
 * `CatalogModule`.
 *
 * Desde a UXF-010A, não depende mais de `RevalidateAffectedArticlesUseCase`
 * — a revalidação de Categoria não descobre mais Artigos afetados
 * individualmente (a UXW-001 tornou a página de Categoria do FastCompre
 * uma leitura ao vivo do catálogo), então renomear/atualizar uma Categoria
 * aciona uma única tentativa de revalidação por `siteSlug`, sem
 * `articleSlug`. `RevalidateAffectedArticlesUseCase.revalidateForCategory`
 * e `FindAffectedPublishedArticlesUseCase.findByCategory` continuam
 * existindo, intocados, sem consumidor.
 *
 * Sem `try/catch`/`Logger` própria: `RevalidateCategoryUseCase` já
 * garante, por contrato, que toda falha é capturada e logada internamente,
 * e que `Promise<void>` sempre resolve — duplicar esse tratamento aqui
 * reimplementaria uma responsabilidade que já não é deste orquestrador.
 * Falha de persistência (`NOT_FOUND`/`SLUG_CONFLICT`), por outro lado,
 * significa que nada mudou — a revalidação nunca é acionada nesse caso.
 */
@Injectable()
export class UpdateCategoryAndRevalidateUseCase {
  constructor(
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly revalidateCategoryUseCase: RevalidateCategoryUseCase,
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

    await this.revalidateCategoryUseCase.execute({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      categoryId: input.categoryId,
    });

    return result;
  }
}
