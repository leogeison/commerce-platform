import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  listPublicArticlesQuerySchema,
  publicArticleParamsSchema,
  publicArticlesSiteParamsSchema,
  type ListPublicArticlesQuery,
  type ListPublicArticlesResponse,
  type PublicArticle,
  type PublicArticleParams,
  type PublicArticlesSiteParams,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PublicTenantGuard } from '../../tenancy/presentation/public-tenant.guard';
import { GetPublicArticleUseCase } from '../application/get-public-article.use-case';
import { ListPublicArticlesUseCase } from '../application/list-public-articles.use-case';
import { toPublicArticle, toPublicArticleSummary } from './public-article.presenter';

const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';

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
  constructor(
    private readonly listPublicArticlesUseCase: ListPublicArticlesUseCase,
    private readonly getPublicArticleUseCase: GetPublicArticleUseCase,
  ) {}

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

  /**
   * `GET /public/sites/:siteSlug/articles/:slug` (PUB-003; Architecture.md
   * §31).
   *
   * Mesmos guards de `list()`: só `PublicTenantGuard`.
   *
   * `404` genérico (`ARTICLE_NOT_FOUND_MESSAGE`) para "não existe", "existe
   * em outro Site" e "existe mas não está `PUBLISHED`" — os três chegam
   * aqui como o mesmo `null` de `GetPublicArticleUseCase`/
   * `findOnePublishedBySite`, satisfazendo o critério de aceite da PUB-003
   * ("404 se não publicado, mesmo que o slug exista em outro status") sem
   * o controller tentar distinguir o que o caso de uso já não distingue —
   * mesmo raciocínio de `ArticlesController.detail()` (admin).
   *
   * Resposta usa `toPublicArticle` (corpo completo, com `bodyMdx` e
   * `products`) — diferente de `list()`, que usa o resumo.
   */
  @Get(':slug')
  @UseGuards(PublicTenantGuard)
  async detail(
    @Param(new ZodValidationPipe(publicArticleParamsSchema))
    params: PublicArticleParams,
    @Req() req: Request,
  ): Promise<PublicArticle> {
    const article = await this.getPublicArticleUseCase.execute({
      siteId: req.tenant!.siteId,
      slug: params.slug,
    });

    if (!article) {
      throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
    }

    return toPublicArticle(article);
  }
}
