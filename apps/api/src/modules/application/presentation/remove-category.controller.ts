import {
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { categoryParamsSchema, type CategoryParams } from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { RemoveCategoryUseCase } from '../application/remove-category.use-case';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';
const CATEGORY_LINKED_TO_ARTICLE_MESSAGE =
  'Esta Categoria está vinculada a um ou mais Artigos e não pode ser excluída.';
const CATEGORY_HAS_PRODUCTS_MESSAGE =
  'Esta Categoria possui Produtos cadastrados e não pode ser excluída.';

/**
 * `DELETE /admin/sites/:siteSlug/categories/:id` (APP-006) — endpoint
 * HTTP real da exclusão cross-domain de Categoria. Mesmos moldes exatos
 * de `RemoveProductController` (APP-003).
 *
 * Vive em `ApplicationModule`, não em `CategoriesController`/`CatalogModule`
 * — exclusão de Categoria é cross-domain (verifica vínculo com Artigo, em
 * Editorial, antes de delegar a exclusão física a `CAT-007`, em Catalog),
 * não uma responsabilidade exclusiva do domínio Catalog. Reaproveita
 * `categoryParamsSchema` (`{ siteSlug, id }`) já existente.
 *
 * Guards/`@MinRole('OWNER')`/`@HttpCode(204)`/`Promise<void>`: mesmo
 * padrão exato de `RemoveProductController` — `OriginGuard` antes de
 * sessão/banco (mutação), `SiteAuthorizationGuard` por último, `OWNER`
 * (Architecture.md §16/§32: "arquivamento e exclusão exigem OWNER"), sem
 * corpo de resposta em sucesso.
 *
 * `NOT_FOUND` → `404`, `LINKED_TO_ARTICLE`/`HAS_PRODUCTS` → `409`
 * (conflito de referência).
 */
@Controller('admin/sites/:siteSlug/categories')
export class RemoveCategoryController {
  constructor(private readonly removeCategoryUseCase: RemoveCategoryUseCase) {}

  @Delete(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(204)
  async remove(
    @Param(new ZodValidationPipe(categoryParamsSchema))
    params: CategoryParams,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.removeCategoryUseCase.execute({
      siteId: req.tenant!.siteId,
      categoryId: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'LINKED_TO_ARTICLE') {
        throw new ConflictException(CATEGORY_LINKED_TO_ARTICLE_MESSAGE);
      }

      throw new ConflictException(CATEGORY_HAS_PRODUCTS_MESSAGE);
    }
  }
}
