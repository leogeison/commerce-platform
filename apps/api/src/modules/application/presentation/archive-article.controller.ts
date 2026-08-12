import {
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
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
import { ArchiveArticleAndRevalidateUseCase } from '../application/archive-article-and-revalidate.use-case';

const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';
const ARCHIVE_WRONG_STATUS_MESSAGE = 'Somente Artigos em PUBLISHED podem ser arquivados.';

/**
 * `POST /admin/sites/:siteSlug/articles/:id/archive` — único caminho HTTP
 * que persiste `ARCHIVED`. Vive em `ApplicationModule`, não em
 * `ArticlesController`/`EditorialModule` — mesmo critério de
 * `PublishArticleController`: a operação atravessa Editorial (arquivamento
 * em si) e a porta de Revalidação, então não é responsabilidade exclusiva
 * de um único domínio.
 *
 * `@MinRole('OWNER')`: arquivamento é ação administrativa de maior
 * privilégio, mesma Role já exigida para arquivar Categoria/Produto/Oferta
 * e para `restore-to-draft` de Artigo — diferente do `EDITOR` do fluxo
 * editorial normal (submeter para revisão, publicar).
 *
 * `NOT_FOUND` → `404`. `WRONG_STATUS` → `409`: transição de estado simples
 * (só `PUBLISHED` pode ser arquivado), mesmo tratamento já usado por
 * `submit-for-review`/`revert-to-draft`/`restore-to-draft` — não o `422`
 * de `publish`, que resolve uma checklist multi-condição estruturalmente
 * diferente.
 */
@Controller('admin/sites/:siteSlug/articles')
export class ArchiveArticleController {
  constructor(
    private readonly archiveArticleAndRevalidateUseCase: ArchiveArticleAndRevalidateUseCase,
  ) {}

  @Post(':id/archive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async archive(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.archiveArticleAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      articleId: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(ARCHIVE_WRONG_STATUS_MESSAGE);
    }

    return toArticleAdmin(result.article);
  }
}
