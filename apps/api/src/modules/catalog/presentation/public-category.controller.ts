import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  listPublicCategoriesQuerySchema,
  publicCategoriesSiteParamsSchema,
  publicCategoryParamsSchema,
  type ListPublicCategoriesQuery,
  type ListPublicCategoriesResponse,
  type PublicCategoriesSiteParams,
  type PublicCategory,
  type PublicCategoryParams,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PublicTenantGuard } from '../../tenancy/presentation/public-tenant.guard';
import { GetPublicCategoryUseCase } from '../application/get-public-category.use-case';
import { ListPublicCategoriesUseCase } from '../application/list-public-categories.use-case';
import { toPublicCategory } from './category.presenter';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';

/**
 * `GET /public/sites/:siteSlug/categories/:slug` (PUB-004; Architecture.md
 * §31) e `GET /public/sites/:siteSlug/categories` (UXF-010).
 *
 * Só `PublicTenantGuard` — mesmo critério de `PublicArticlesController`:
 * leitura pública, sem `OriginGuard`/`SessionAuthGuard`/
 * `SiteAuthorizationGuard`/`@MinRole`/rate limit.
 *
 * `siteId` de `req.tenant!.siteId`, nunca do query string — mesma
 * disciplina de tenant isolation de toda rota pública do projeto.
 *
 * `404` genérico (`CATEGORY_NOT_FOUND_MESSAGE`) para "não existe" e "existe
 * em outro Site" — os dois chegam aqui como o mesmo `null` de
 * `GetPublicCategoryUseCase`/`findOneBySlug`. Categoria arquivada **não**
 * cai aqui: decisão explícita da PUB-004, `findOneBySlug` não filtra
 * `archivedAt`, então uma Categoria arquivada sempre devolve `200`.
 */
@Controller('public/sites/:siteSlug/categories')
export class PublicCategoryController {
  constructor(
    private readonly listPublicCategoriesUseCase: ListPublicCategoriesUseCase,
    private readonly getPublicCategoryUseCase: GetPublicCategoryUseCase,
  ) {}

  /**
   * `GET /public/sites/:siteSlug/categories` (UXF-010).
   *
   * Mesmos guards de `detail()`: só `PublicTenantGuard`.
   *
   * Delega a `ListPublicCategoriesUseCase`/`findManyUnarchivedBySite` —
   * diferente de `detail()`, aqui uma Categoria arquivada nunca aparece
   * (filtro estrutural do método do repository, não uma decisão deste
   * controller). Mesmo padrão exato de
   * `PublicArticlesController.list()` (PUB-002).
   */
  @Get()
  @UseGuards(PublicTenantGuard)
  async list(
    @Param(new ZodValidationPipe(publicCategoriesSiteParamsSchema))
    _params: PublicCategoriesSiteParams,
    @Query(new ZodValidationPipe(listPublicCategoriesQuerySchema))
    query: ListPublicCategoriesQuery,
    @Req() req: Request,
  ): Promise<ListPublicCategoriesResponse> {
    const result = await this.listPublicCategoriesUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items.map(toPublicCategory),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  @Get(':slug')
  @UseGuards(PublicTenantGuard)
  async detail(
    @Param(new ZodValidationPipe(publicCategoryParamsSchema))
    params: PublicCategoryParams,
    @Req() req: Request,
  ): Promise<PublicCategory> {
    const category = await this.getPublicCategoryUseCase.execute({
      siteId: req.tenant!.siteId,
      slug: params.slug,
    });

    if (!category) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toPublicCategory(category);
  }
}
