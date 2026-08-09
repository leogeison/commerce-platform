import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  publicCategoryParamsSchema,
  type PublicCategory,
  type PublicCategoryParams,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PublicTenantGuard } from '../../tenancy/presentation/public-tenant.guard';
import { GetPublicCategoryUseCase } from '../application/get-public-category.use-case';
import { toPublicCategory } from './category.presenter';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';

/**
 * `GET /public/sites/:siteSlug/categories/:slug` (PUB-004; Architecture.md
 * §31).
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
  constructor(private readonly getPublicCategoryUseCase: GetPublicCategoryUseCase) {}

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
