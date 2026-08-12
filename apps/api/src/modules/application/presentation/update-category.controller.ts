import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  categoryParamsSchema,
  updateCategoryRequestSchema,
  type CategoryAdmin,
  type CategoryParams,
  type UpdateCategoryRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toCategoryAdmin } from '../../catalog/presentation/category.presenter';
import { UpdateCategoryAndRevalidateUseCase } from '../application/update-category-and-revalidate.use-case';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';
const SLUG_CONFLICT_MESSAGE = 'Já existe uma categoria com este slug neste Site.';

/**
 * `PATCH /admin/sites/:siteSlug/categories/:id` — único caminho HTTP que
 * persiste alterações de `Category`. Vive em `ApplicationModule`, não em
 * `CategoriesController`/`CatalogModule` — mesmo critério de
 * `UpdateCategoryAndRevalidateUseCase`: a operação atravessa Catalog
 * (atualização em si) e a coordenação de revalidação, então não é
 * responsabilidade exclusiva de um único domínio. Coexiste com
 * `CategoriesController` no mesmo prefixo de rota, mesmo padrão já usado
 * por `PublishArticleController`/`ArchiveArticleController`.
 *
 * `@MinRole('EDITOR')`: atualizar é escrita de conteúdo, mesma Role de
 * `create()` em `CategoriesController` — diferente do `OWNER` exigido para
 * arquivar/excluir.
 *
 * `NOT_FOUND` → `404`. `SLUG_CONFLICT` → `409`, mesma tradução já usada em
 * `CategoriesController.create()`.
 */
@Controller('admin/sites/:siteSlug/categories')
export class UpdateCategoryController {
  constructor(
    private readonly updateCategoryAndRevalidateUseCase: UpdateCategoryAndRevalidateUseCase,
  ) {}

  @Patch(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(
    @Param(new ZodValidationPipe(categoryParamsSchema))
    params: CategoryParams,
    @Body(new ZodValidationPipe(updateCategoryRequestSchema))
    body: UpdateCategoryRequest,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const result = await this.updateCategoryAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      categoryId: params.id,
      name: body.name,
      slug: body.slug,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(SLUG_CONFLICT_MESSAGE);
    }

    return toCategoryAdmin(result.category);
  }
}
