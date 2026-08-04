import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  articleParamsSchema,
  type ArticleHealthResponse,
  type ArticleParams,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CalculateArticleHealthUseCase } from '../application/calculate-article-health.use-case';
import { toArticleHealthResponse } from './article-health.presenter';

const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';

/**
 * `GET /admin/sites/:siteSlug/articles/:id/health` (APP-001).
 *
 * Vive em `ApplicationModule`, não em `ArticlesController`/`EditorialModule`
 * — saúde do Artigo é responsabilidade cross-domain do módulo `application`
 * (Architecture.md §14: "calcular saúde operacional do Artigo"), não do
 * domínio Editorial. Reaproveita `articleParamsSchema` (`{ siteSlug, id }`)
 * já existente em `@commerce-platform/contracts` — mesma forma de
 * `ArticlesController.detail()`/`update()`, nenhum params novo necessário.
 *
 * Mesmos guards/`@MinRole('VIEWER')` de `ArticlesController.detail()`:
 * `GET` não mutável, sem `OriginGuard`, leitura mínima da hierarquia.
 *
 * `404` genérico tenant-aware: `CalculateArticleHealthUseCase` devolve o
 * mesmo `NOT_FOUND` para "não existe" e "existe, mas é de outro Site"
 * (delegado a `PrismaArticleRepository.findOneBySite`) — mesmo critério já
 * usado em todo o resto do projeto, o controller nunca tenta distinguir o
 * que o caso de uso já não distingue.
 */
@Controller('admin/sites/:siteSlug/articles')
export class ArticleHealthController {
  constructor(private readonly calculateArticleHealthUseCase: CalculateArticleHealthUseCase) {}

  @Get(':id/health')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async health(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleHealthResponse> {
    const result = await this.calculateArticleHealthUseCase.execute({
      siteId: req.tenant!.siteId,
      articleId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
    }

    return toArticleHealthResponse(result.health);
  }
}
