import { Injectable } from '@nestjs/common';
import { ArchiveCategoryUseCase } from '../../catalog/application/archive-category.use-case';
import { UnarchiveCategoryUseCase } from '../../catalog/application/unarchive-category.use-case';
import { RevalidateCategoryUseCase } from './revalidate-category.use-case';
import type { Category } from '../../../generated/prisma/client';

export interface CategoryArchiveAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  categoryId: string;
}

export type CategoryArchiveAndRevalidateResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'NOT_FOUND' };

/**
 * Único caminho HTTP que persiste `archivedAt` de `Category`, nos dois
 * sentidos (UXF-010A) — mesmo molde de
 * `ProductArchiveAndRevalidateUseCase`/REV-011. Nome neutro em relação à
 * direção — cobre tanto `archive()` quanto `unarchive()` — mas os dois
 * caminhos continuam explícitos: `archive()` só chama
 * `ArchiveCategoryUseCase` (CAT-005), `unarchive()` só chama
 * `UnarchiveCategoryUseCase` (CAT-006). Nenhum despacho genérico entre os
 * dois. Cross-domain (Catalog + a coordenação de revalidação), por isso
 * vive em `application`, não em `CatalogModule`.
 *
 * `ArchiveCategoryUseCase`/`UnarchiveCategoryUseCase` são idempotentes
 * (`PrismaCategoryRepository.archiveBySite`/`unarchiveBySite`): chamar
 * `archive()` numa Categoria já arquivada, ou `unarchive()` numa já ativa,
 * ainda retorna a Categoria (não `null`) — decisão explícita, espelhando o
 * precedente de `ProductArchiveAndRevalidateUseCase`: esse sucesso
 * idempotente é tratado como sucesso normal, sem `409`/`UNCHANGED`, e ainda
 * aciona `RevalidateCategoryUseCase` normalmente. Só `null` (Categoria não
 * existe ou é de outro Site) impede a revalidação.
 *
 * Sem `try/catch`/`Logger` própria — `RevalidateCategoryUseCase` já
 * garante, por contrato, que toda falha é capturada e logada internamente,
 * e que `Promise<void>` sempre resolve.
 */
@Injectable()
export class CategoryArchiveAndRevalidateUseCase {
  constructor(
    private readonly archiveCategoryUseCase: ArchiveCategoryUseCase,
    private readonly unarchiveCategoryUseCase: UnarchiveCategoryUseCase,
    private readonly revalidateCategoryUseCase: RevalidateCategoryUseCase,
  ) {}

  async archive(
    input: CategoryArchiveAndRevalidateInput,
  ): Promise<CategoryArchiveAndRevalidateResult> {
    const category = await this.archiveCategoryUseCase.execute({
      siteId: input.siteId,
      id: input.categoryId,
    });

    if (!category) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateCategoryUseCase.execute({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      categoryId: input.categoryId,
    });

    return { ok: true, category };
  }

  async unarchive(
    input: CategoryArchiveAndRevalidateInput,
  ): Promise<CategoryArchiveAndRevalidateResult> {
    const category = await this.unarchiveCategoryUseCase.execute({
      siteId: input.siteId,
      id: input.categoryId,
    });

    if (!category) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateCategoryUseCase.execute({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      categoryId: input.categoryId,
    });

    return { ok: true, category };
  }
}
