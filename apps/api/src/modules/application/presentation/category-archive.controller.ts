import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  categoryParamsSchema,
  type CategoryAdmin,
  type CategoryParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toCategoryAdmin } from '../../catalog/presentation/category.presenter';
import { CategoryArchiveAndRevalidateUseCase } from '../application/category-archive-and-revalidate.use-case';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';

/**
 * `POST /admin/sites/:siteSlug/categories/:id/archive` e
 * `POST /admin/sites/:siteSlug/categories/:id/unarchive` (CAT-005/CAT-006;
 * UXF-010A) — único caminho HTTP que persiste `archivedAt` de `Category`,
 * nos dois sentidos. Vive em `ApplicationModule`, não em
 * `CategoriesController`/`CatalogModule` — mesmo critério de
 * `ProductArchiveController`. Coexiste com `CategoriesController`/
 * `UpdateCategoryController`/`CreateCategoryController` no mesmo prefixo de
 * rota.
 *
 * Uma única classe cobrindo os dois endpoints (mesma tarefa de backlog),
 * mas dois métodos explícitos — nenhum despacho genérico entre `archive`/
 * `unarchive`. Guards/`@MinRole('OWNER')`/`@HttpCode(200)` preservados
 * exatamente como estavam em `CategoriesController.archive()`/
 * `unarchive()` antes desta tarefa — só o local dos handlers e o caso de
 * uso injetado mudaram.
 *
 * `NOT_FOUND` → `404`, único motivo de falha possível
 * (`ArchiveCategoryUseCase`/`UnarchiveCategoryUseCase` são idempotentes —
 * nunca há conflito de estado, ver `CategoryArchiveAndRevalidateUseCase`).
 */
@Controller('admin/sites/:siteSlug/categories')
export class CategoryArchiveController {
  constructor(
    private readonly categoryArchiveAndRevalidateUseCase: CategoryArchiveAndRevalidateUseCase,
  ) {}

  @Post(':id/archive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async archive(
    @Param(new ZodValidationPipe(categoryParamsSchema))
    params: CategoryParams,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const result = await this.categoryArchiveAndRevalidateUseCase.archive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      categoryId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toCategoryAdmin(result.category);
  }

  @Post(':id/unarchive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async unarchive(
    @Param(new ZodValidationPipe(categoryParamsSchema))
    params: CategoryParams,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const result = await this.categoryArchiveAndRevalidateUseCase.unarchive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      categoryId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toCategoryAdmin(result.category);
  }
}
