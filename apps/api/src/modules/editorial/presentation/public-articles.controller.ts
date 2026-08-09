import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  listPublicArticlesQuerySchema,
  publicArticlesSiteParamsSchema,
  type ListPublicArticlesQuery,
  type ListPublicArticlesResponse,
  type PublicArticlesSiteParams,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PublicTenantGuard } from '../../tenancy/presentation/public-tenant.guard';
import { ListPublicArticlesUseCase } from '../application/list-public-articles.use-case';
import { toPublicArticleSummary } from './public-article.presenter';

/**
 * `GET /public/sites/:siteSlug/articles` (PUB-002; Architecture.md §31).
 *
 * Só `PublicTenantGuard` — sem `OriginGuard` (não é mutação),
 * `SessionAuthGuard`/`SiteAuthorizationGuard`/`@MinRole` (não é rota
 * administrativa), nem rate limit (nenhuma tarefa do backlog pede isso
 * para a API pública, diferente do redirect de afiliado, TRK-007).
 *
 * `siteId` de `req.tenant!.siteId` (populado pelo guard a partir de
 * `:siteSlug`), nunca do query string — mesma disciplina de tenant
 * isolation de toda rota do projeto.
 *
 * Sem `@HttpCode` explícito: `GET` já responde `200` por padrão do Nest,
 * mesmo padrão de `AuthController.me`.
 */
@Controller('public/sites/:siteSlug/articles')
export class PublicArticlesController {
  constructor(private readonly listPublicArticlesUseCase: ListPublicArticlesUseCase) {}

  @Get()
  @UseGuards(PublicTenantGuard)
  async list(
    @Param(new ZodValidationPipe(publicArticlesSiteParamsSchema))
    _params: PublicArticlesSiteParams,
    @Query(new ZodValidationPipe(listPublicArticlesQuerySchema))
    query: ListPublicArticlesQuery,
    @Req() req: Request,
  ): Promise<ListPublicArticlesResponse> {
    const result = await this.listPublicArticlesUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
      categorySlug: query.categorySlug,
      type: query.type,
    });

    return {
      items: result.items.map(toPublicArticleSummary),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }
}
