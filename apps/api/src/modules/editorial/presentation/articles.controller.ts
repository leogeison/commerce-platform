import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  articlesSiteParamsSchema,
  createArticleRequestSchema,
  listArticlesQuerySchema,
  type ArticleAdmin,
  type ArticlesSiteParams,
  type CreateArticleRequest,
  type ListArticlesQuery,
  type ListArticlesResponse,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateArticleUseCase } from '../application/create-article.use-case';
import { ListArticlesUseCase } from '../application/list-articles.use-case';
import { toArticleAdmin, toArticleSummaryAdmin } from './article.presenter';

const SLUG_CONFLICT_MESSAGE = 'Já existe um Artigo com este slug neste Site.';
const CATEGORY_NOT_FOUND_MESSAGE = 'categoryId inválido: a categoria não existe.';
const AUTHOR_NOT_FOUND_MESSAGE = 'authorId inválido: o autor não existe.';

/**
 * `POST /admin/sites/:siteSlug/articles` (EDT-006; CTR-007).
 *
 * Mesma ordem de guards/`@MinRole('EDITOR')` de `AuthorsController.create()`/
 * `CategoriesController.create()`: `OriginGuard` antes de sessão/banco,
 * `SiteAuthorizationGuard` por último (depende de `request.auth`) — criar
 * Artigo é escrita de conteúdo, regra geral do Architecture.md §16
 * ("`EDITOR` cria/edita").
 *
 * `siteId` vem exclusivamente de `req.tenant!.siteId`, nunca do body —
 * mesma disciplina de tenant isolation de todo `create()` do projeto.
 *
 * Sem pré-checagem de `slug`/`categoryId`/`authorId`: o repository resolve
 * os três conflitos de forma reativa (tenta inserir, traduz `P2002`/`P2003`
 * só quando a constraint específica é identificada com segurança — ver
 * `PrismaArticleRepository`) — este controller só traduz o resultado
 * tipado para HTTP: `SLUG_CONFLICT` → `409` (mesma categoria de conflito
 * de unicidade de `USER_ALREADY_HAS_AUTHOR`/`SLUG_CONFLICT` de
 * Categoria/Produto), `CATEGORY_NOT_FOUND`/`AUTHOR_NOT_FOUND` → `422`
 * (referência que não existe, mesmo status já usado em `USER_NOT_FOUND`
 * de `AuthorsController.create()`).
 *
 * `EDT-006`/`EDT-007` implementados neste controller — `EDT-008`
 * (detalhar), `EDT-009` (atualizar) e `EDT-010` (vincular Produto) entram
 * junto de suas respectivas tarefas.
 */
@Controller('admin/sites/:siteSlug/articles')
export class ArticlesController {
  constructor(
    private readonly createArticleUseCase: CreateArticleUseCase,
    private readonly listArticlesUseCase: ListArticlesUseCase,
  ) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(articlesSiteParamsSchema))
    _params: ArticlesSiteParams,
    @Body(new ZodValidationPipe(createArticleRequestSchema))
    body: CreateArticleRequest,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.createArticleUseCase.execute({
      siteId: req.tenant!.siteId,
      type: body.type,
      title: body.title,
      slug: body.slug,
      categoryId: body.categoryId,
      authorId: body.authorId,
      metaDescription: body.metaDescription,
      coverImageUrl: body.coverImageUrl,
      bodyMdx: body.bodyMdx,
    });

    if (!result.ok) {
      if (result.reason === 'SLUG_CONFLICT') {
        throw new ConflictException(SLUG_CONFLICT_MESSAGE);
      }

      if (result.reason === 'CATEGORY_NOT_FOUND') {
        throw new UnprocessableEntityException(CATEGORY_NOT_FOUND_MESSAGE);
      }

      throw new UnprocessableEntityException(AUTHOR_NOT_FOUND_MESSAGE);
    }

    return toArticleAdmin(result.article);
  }

  /**
   * `GET /admin/sites/:siteSlug/articles` (EDT-007; CTR-007).
   *
   * Só `SessionAuthGuard, SiteAuthorizationGuard` (sem `OriginGuard`): `GET`
   * não é mutável, mesmo critério já usado em `AuthorsController.list()`.
   *
   * `@MinRole('VIEWER')`: a Role mínima da hierarquia — listar é leitura,
   * mesma regra geral do Architecture.md §16 já aplicada em
   * Categoria/Produto/Autor.
   *
   * `listArticlesQuerySchema` já aplica os defaults de paginação (`page: 1,
   * pageSize: 20`) e os três filtros opcionais (`status?`, `type?`,
   * `categoryId?`, Architecture.md §32) antes de chegar aqui.
   *
   * Resposta usa `toArticleSummaryAdmin` (sem `bodyMdx`) — decisão
   * explícita da CTR-007, `articleSummaryAdminSchema`.
   */
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async list(
    @Param(new ZodValidationPipe(articlesSiteParamsSchema))
    _params: ArticlesSiteParams,
    @Query(new ZodValidationPipe(listArticlesQuerySchema))
    query: ListArticlesQuery,
    @Req() req: Request,
  ): Promise<ListArticlesResponse> {
    const result = await this.listArticlesUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      type: query.type,
      categoryId: query.categoryId,
    });

    return {
      items: result.items.map(toArticleSummaryAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }
}
