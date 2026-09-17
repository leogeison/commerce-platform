import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  categoriesSiteParamsSchema,
  createCategoryRequestSchema,
  type CategoriesSiteParams,
  type CategoryAdmin,
  type CreateCategoryRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toCategoryAdmin } from '../../catalog/presentation/category.presenter';
import { CreateCategoryAndRevalidateUseCase } from '../application/create-category-and-revalidate.use-case';

const SLUG_CONFLICT_MESSAGE = 'Já existe uma categoria com este slug neste Site.';

/**
 * `POST /admin/sites/:siteSlug/categories` (CAT-001; UXF-010A) — único
 * caminho HTTP que persiste a criação de `Category`. Vive em
 * `ApplicationModule`, não em `CategoriesController`/`CatalogModule` —
 * mesmo critério de `UpdateCategoryController`/`ProductArchiveController`:
 * a operação atravessa Catalog (criação em si) e a coordenação de
 * revalidação (UXF-010A), então não é responsabilidade exclusiva de um
 * único domínio. Coexiste com `CategoriesController` no mesmo prefixo de
 * rota, mesmo padrão já usado por `UpdateCategoryController`.
 *
 * Guards/`@MinRole('EDITOR')`/`@HttpCode(201)` e tradução de
 * `SLUG_CONFLICT` para `409` preservados exatamente como estavam em
 * `CategoriesController.create()` antes desta tarefa — só o local do
 * handler e o caso de uso injetado mudaram.
 */
@Controller('admin/sites/:siteSlug/categories')
export class CreateCategoryController {
  constructor(
    private readonly createCategoryAndRevalidateUseCase: CreateCategoryAndRevalidateUseCase,
  ) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(categoriesSiteParamsSchema))
    params: CategoriesSiteParams,
    @Body(new ZodValidationPipe(createCategoryRequestSchema))
    body: CreateCategoryRequest,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const result = await this.createCategoryAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      name: body.name,
      slug: body.slug,
    });

    if (!result.ok) {
      throw new ConflictException(SLUG_CONFLICT_MESSAGE);
    }

    return toCategoryAdmin(result.category);
  }
}
