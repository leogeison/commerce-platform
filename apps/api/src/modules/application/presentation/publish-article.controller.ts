import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { articleParamsSchema, type ArticleAdmin, type ArticleParams } from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toArticleAdmin } from '../../editorial/presentation/article.presenter';
import { PublishArticleAndRevalidateUseCase } from '../application/publish-article-and-revalidate.use-case';

const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';
const PUBLICATION_VALIDATION_FAILED_MESSAGE =
  'Não é possível publicar: uma ou mais condições de publicação não foram atendidas.';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/publish` (REV-003) — único
 * caminho HTTP que persiste `PUBLISHED`. Vive em `ApplicationModule`, não
 * em `ArticlesController`/`EditorialModule` — mesmo critério de
 * `RemoveProductController` (APP-003): a operação atravessa Editorial
 * (publicação em si) e a porta de Revalidação, então não é responsabilidade
 * exclusiva de um único domínio. Coexistir com `ArticlesController` no
 * mesmo prefixo de rota é o mesmo padrão já usado por
 * `RemoveProductController`/`ProductsController`.
 *
 * `NOT_FOUND` → `404`. `VALIDATION_FAILED` → `422`, com a lista exata de
 * `PublicationIssue` em `details.issues` (via `AllExceptionsFilter`) — não
 * `409`, porque não é um conflito de estado simples, e sim uma checagem
 * multi-condição com resultado estruturado que o cliente precisa exibir.
 */
@Controller('admin/sites/:siteSlug/articles')
export class PublishArticleController {
  constructor(
    private readonly publishArticleAndRevalidateUseCase: PublishArticleAndRevalidateUseCase,
  ) {}

  @Post(':id/publish')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(200)
  async publish(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.publishArticleAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      articleId: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      throw new UnprocessableEntityException({
        message: PUBLICATION_VALIDATION_FAILED_MESSAGE,
        details: { issues: result.issues },
      });
    }

    return toArticleAdmin(result.article);
  }
}
