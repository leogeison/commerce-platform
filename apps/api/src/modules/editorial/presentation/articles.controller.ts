import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  articleParamsSchema,
  articleProductParamsSchema,
  articlesSiteParamsSchema,
  createArticleRequestSchema,
  linkArticleProductRequestSchema,
  listArticlesQuerySchema,
  reorderArticleProductsRequestSchema,
  updateArticleRequestSchema,
  type ArticleAdmin,
  type ArticleParams,
  type ArticleProductParams,
  type ArticleProductsResponse,
  type ArticlesSiteParams,
  type CreateArticleRequest,
  type LinkArticleProductRequest,
  type ListArticlesQuery,
  type ListArticlesResponse,
  type ReorderArticleProductsRequest,
  type UpdateArticleRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateArticleUseCase } from '../application/create-article.use-case';
import { GetArticleProductsUseCase } from '../application/get-article-products.use-case';
import { GetArticleUseCase } from '../application/get-article.use-case';
import { LinkArticleProductUseCase } from '../application/link-article-product.use-case';
import { ListArticlesUseCase } from '../application/list-articles.use-case';
import { ReorderArticleProductsUseCase } from '../application/reorder-article-products.use-case';
import { RestoreArticleToDraftUseCase } from '../application/restore-article-to-draft.use-case';
import { RevertArticleToDraftUseCase } from '../application/revert-article-to-draft.use-case';
import { SubmitArticleForReviewUseCase } from '../application/submit-article-for-review.use-case';
import { UnlinkArticleProductUseCase } from '../application/unlink-article-product.use-case';
import { UpdateArticleUseCase } from '../application/update-article.use-case';
import { toArticleAdmin, toArticleSummaryAdmin } from './article.presenter';

const SLUG_CONFLICT_MESSAGE = 'Já existe um Artigo com este slug neste Site.';
const CATEGORY_NOT_FOUND_MESSAGE = 'categoryId inválido: a categoria não existe.';
const AUTHOR_NOT_FOUND_MESSAGE = 'authorId inválido: o autor não existe.';
const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';
const ARTICLE_NOT_DRAFT_MESSAGE = 'Somente Artigos em DRAFT podem ser editados.';
const PRODUCT_NOT_FOUND_MESSAGE = 'productId inválido: o produto não existe.';
const PRODUCT_ALREADY_LINKED_MESSAGE = 'Este Produto já está vinculado a este Artigo.';
const PRODUCT_NOT_LINKED_MESSAGE = 'Este Produto não está vinculado a este Artigo.';
const INVALID_PRODUCT_SET_MESSAGE =
  'productIds precisa conter exatamente o mesmo conjunto de Produtos já vinculados a este Artigo.';
const SUBMIT_FOR_REVIEW_WRONG_STATUS_MESSAGE =
  'Somente Artigos em DRAFT podem ser enviados para revisão.';
const REVERT_TO_DRAFT_WRONG_STATUS_MESSAGE =
  'Somente Artigos em PENDING_REVIEW podem retornar a DRAFT.';
const RESTORE_TO_DRAFT_WRONG_STATUS_MESSAGE =
  'Somente Artigos em ARCHIVED podem ser restaurados a DRAFT.';

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
 * `EDT-006` a `EDT-010` implementados neste controller — nenhuma
 * transição de estado (`EDT-012` a `EDT-016`) entra aqui.
 */
@Controller('admin/sites/:siteSlug/articles')
export class ArticlesController {
  constructor(
    private readonly createArticleUseCase: CreateArticleUseCase,
    private readonly listArticlesUseCase: ListArticlesUseCase,
    private readonly getArticleUseCase: GetArticleUseCase,
    private readonly updateArticleUseCase: UpdateArticleUseCase,
    private readonly getArticleProductsUseCase: GetArticleProductsUseCase,
    private readonly linkArticleProductUseCase: LinkArticleProductUseCase,
    private readonly unlinkArticleProductUseCase: UnlinkArticleProductUseCase,
    private readonly reorderArticleProductsUseCase: ReorderArticleProductsUseCase,
    private readonly submitArticleForReviewUseCase: SubmitArticleForReviewUseCase,
    private readonly revertArticleToDraftUseCase: RevertArticleToDraftUseCase,
    private readonly restoreArticleToDraftUseCase: RestoreArticleToDraftUseCase,
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
   * `query.orderBy` (UXA-017) repassado direto — mesmo estilo já usado
   * para `status`/`type`/`categoryId` acima, sem spread condicional: este
   * controller não tem teste que verifique a forma exata do objeto
   * passado a `execute()` (só e2e via HTTP), diferente do boundary
   * `ListArticlesUseCase` → `findManyBySite`, onde o spread condicional
   * existe especificamente para preservar a forma histórica da chamada ao
   * repository. `undefined` aqui já é o comportamento correto: `execute()`
   * trata a ausência de `orderBy` preservando o `createdAt desc` default
   * (UXF-012), sem exigir nenhum tratamento adicional neste controller.
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
      orderBy: query.orderBy,
    });

    return {
      items: result.items.map(toArticleSummaryAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * `GET /admin/sites/:siteSlug/articles/:id` (EDT-008; CTR-007).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `list()`: `GET` não mutável, sem
   * `OriginGuard`, leitura mínima da hierarquia.
   *
   * `articleParamsSchema` (não `articlesSiteParamsSchema`): a única
   * diferença entre as duas rotas é o `id` — o pipe já garante `422` para
   * um `id` que não seja UUID, antes de chegar ao repository.
   *
   * `404` genérico para "não existe" e "existe, mas é de outro Site":
   * `GetArticleUseCase`/`findOneBySite` já devolvem o mesmo `null` para os
   * dois casos (mesmo raciocínio de isolamento já usado em
   * `AuthorsController.detail()`) — o controller nunca tenta distinguir o
   * que o caso de uso já não distingue.
   *
   * Resposta usa `toArticleAdmin` (completo, com `bodyMdx`) — diferente de
   * `list()`, que usa o resumo.
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async detail(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const article = await this.getArticleUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!article) {
      throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
    }

    return toArticleAdmin(article);
  }

  /**
   * `PATCH /admin/sites/:siteSlug/articles/:id` (EDT-009; CTR-007).
   *
   * Mesma ordem de guards/`@MinRole('EDITOR')` de `create()`: `OriginGuard`
   * antes de sessão/banco — editar Artigo é escrita de conteúdo, mesma
   * regra do Architecture.md §16 ("`EDITOR` cria/edita"). Sem
   * `@HttpCode` explícito: `200` é o default do Nest para um handler sem
   * decorator de status, mesmo padrão implícito de `create()`
   * (explicitado lá só porque `POST` default é `201`, diferente de
   * `PATCH`).
   *
   * `updateArticleRequestSchema` já valida a forma e preserva a semântica
   * tri-state (`undefined`/`null`/valor) dos quatro campos nuláveis —
   * este controller só repassa `body` para o caso de uso sem tocar nesses
   * valores (nenhuma normalização que colapse `null` em `undefined`).
   *
   * Sem pré-checagem de status/`slug`/`categoryId`/`authorId`: o
   * repository resolve todos os conflitos de forma reativa (ver
   * `PrismaArticleRepository.updateBySite`) — este controller só traduz o
   * resultado tipado para HTTP: `NOT_FOUND` → `404` (mesmo `404` genérico
   * de `detail()`), `NOT_DRAFT` → `409` (só `DRAFT` é editável,
   * Architecture.md §14), `SLUG_CONFLICT` → `409` (mesma categoria de
   * conflito de `create()`), `CATEGORY_NOT_FOUND`/`AUTHOR_NOT_FOUND` →
   * `422` (mesmo critério de `create()`).
   */
  @Patch(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Body(new ZodValidationPipe(updateArticleRequestSchema))
    body: UpdateArticleRequest,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.updateArticleUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
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
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'NOT_DRAFT') {
        throw new ConflictException(ARTICLE_NOT_DRAFT_MESSAGE);
      }

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
   * `GET /admin/sites/:siteSlug/articles/:id/products` (incremento ADM-009,
   * sobre `EDT-010`) — lista os `productId`s vinculados ao Artigo, na
   * ordem de `position`.
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `detail()`: leitura, sem
   * `OriginGuard`. Chama `GetArticleUseCase` primeiro só para resolver
   * `404` (Artigo não existe ou é de outro Site) — `GetArticleProductsUseCase`
   * não distingue isso de "sem Produtos vinculados" (ambos `[]`), mesmo
   * critério de `detail()` reaproveitado aqui em vez de duplicado.
   *
   * Reaproveita `articleProductsResponseSchema` (`{ productIds }`), mesmo
   * formato de resposta dos três endpoints de mutação de `ArticleProduct` —
   * nenhum contrato novo.
   */
  @Get(':id/products')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async products(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleProductsResponse> {
    const article = await this.getArticleUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!article) {
      throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
    }

    const productIds = await this.getArticleProductsUseCase.execute({
      siteId: req.tenant!.siteId,
      articleId: params.id,
    });

    return { productIds };
  }

  /**
   * `POST /admin/sites/:siteSlug/articles/:id/products` (EDT-010) —
   * vincula um Produto ao Artigo, sempre no fim da lista.
   *
   * Mesma ordem de guards/`@MinRole('EDITOR')` das demais operações
   * mutáveis deste controller — vincular Produto é edição de conteúdo do
   * Artigo (Architecture.md §14, "só permitido em `DRAFT`").
   *
   * Sem pré-checagem de status/Produto: `PrismaArticleProductRepository.linkProduct`
   * resolve tudo dentro de uma única transação (lock do Artigo +
   * `create()` reativo) — este controller só traduz o resultado tipado
   * para HTTP: `NOT_FOUND` → `404`, `NOT_DRAFT` → `409`, `ALREADY_LINKED`
   * → `409` (mesma categoria de conflito de unicidade já usada em
   * `SLUG_CONFLICT`), `PRODUCT_NOT_FOUND` → `422` (mesmo critério de
   * `CATEGORY_NOT_FOUND`/`AUTHOR_NOT_FOUND`).
   *
   * Resposta é a coleção completa e atual (`{ productIds }`), não só o
   * item vinculado — decisão explícita desta tarefa, mesma resposta nos
   * três endpoints de `ArticleProduct`.
   */
  @Post(':id/products')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async linkProduct(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Body(new ZodValidationPipe(linkArticleProductRequestSchema))
    body: LinkArticleProductRequest,
    @Req() req: Request,
  ): Promise<ArticleProductsResponse> {
    const result = await this.linkArticleProductUseCase.execute({
      siteId: req.tenant!.siteId,
      articleId: params.id,
      productId: body.productId,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'NOT_DRAFT') {
        throw new ConflictException(ARTICLE_NOT_DRAFT_MESSAGE);
      }

      if (result.reason === 'ALREADY_LINKED') {
        throw new ConflictException(PRODUCT_ALREADY_LINKED_MESSAGE);
      }

      throw new UnprocessableEntityException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return { productIds: result.productIds };
  }

  /**
   * `DELETE /admin/sites/:siteSlug/articles/:id/products/:productId`
   * (EDT-010) — desvincula um Produto do Artigo, recompactando as
   * posições restantes.
   *
   * Sem `@HttpCode` explícito: `200` é o default do Nest, usado de
   * propósito (não `204`) porque a resposta traz a coleção atualizada —
   * diferente de `AuthorsController.delete()` (exclusão física, sem
   * corpo).
   *
   * `NOT_FOUND` → `404` (Artigo), `NOT_DRAFT` → `409`, `NOT_LINKED` →
   * `404` (Produto real, mas nunca vinculado a este Artigo — tratado como
   * recurso aninhado não encontrado, mesma categoria de `404` genérico já
   * usada no projeto, não como sucesso idempotente).
   */
  @Delete(':id/products/:productId')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async unlinkProduct(
    @Param(new ZodValidationPipe(articleProductParamsSchema))
    params: ArticleProductParams,
    @Req() req: Request,
  ): Promise<ArticleProductsResponse> {
    const result = await this.unlinkArticleProductUseCase.execute({
      siteId: req.tenant!.siteId,
      articleId: params.id,
      productId: params.productId,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'NOT_DRAFT') {
        throw new ConflictException(ARTICLE_NOT_DRAFT_MESSAGE);
      }

      throw new NotFoundException(PRODUCT_NOT_LINKED_MESSAGE);
    }

    return { productIds: result.productIds };
  }

  /**
   * `PATCH /admin/sites/:siteSlug/articles/:id/products/reorder`
   * (EDT-010) — reordena os Produtos vinculados ao Artigo segundo a lista
   * completa recebida.
   *
   * `reorderArticleProductsRequestSchema` já rejeita `productIds`
   * duplicados na validação de forma (`422`, antes de chegar aqui) — este
   * controller só lida com o que depende de estado do banco:
   * `NOT_FOUND` → `404`, `NOT_DRAFT` → `409`, `INVALID_PRODUCT_SET` →
   * `422` (conjunto recebido não bate exatamente com o vinculado hoje).
   */
  @Patch(':id/products/reorder')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async reorderProducts(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Body(new ZodValidationPipe(reorderArticleProductsRequestSchema))
    body: ReorderArticleProductsRequest,
    @Req() req: Request,
  ): Promise<ArticleProductsResponse> {
    const result = await this.reorderArticleProductsUseCase.execute({
      siteId: req.tenant!.siteId,
      articleId: params.id,
      productIds: body.productIds,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'NOT_DRAFT') {
        throw new ConflictException(ARTICLE_NOT_DRAFT_MESSAGE);
      }

      throw new UnprocessableEntityException(INVALID_PRODUCT_SET_MESSAGE);
    }

    return { productIds: result.productIds };
  }

  /**
   * `POST /admin/sites/:siteSlug/articles/:id/submit-for-review`
   * (EDT-012; CTR-008) — transição `DRAFT → PENDING_REVIEW`.
   *
   * Mesmos guards de `create()`/`update()` (mutável) — `@MinRole('EDITOR')`:
   * parte do fluxo normal de edição, nunca toca o estado `ARCHIVED`,
   * mesma Role de criar/editar (Architecture.md §16).
   *
   * Transição incondicional (dado o status de origem correto) — sem
   * checklist de publicação aqui, isso é `APP-002`/`REV-003`, fora do
   * escopo desta tarefa. `NOT_FOUND` → `404`, `WRONG_STATUS` → `409`.
   */
  @Post(':id/submit-for-review')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(HttpStatus.OK)
  async submitForReview(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.submitArticleForReviewUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(SUBMIT_FOR_REVIEW_WRONG_STATUS_MESSAGE);
    }

    return toArticleAdmin(result.article);
  }

  /**
   * `POST /admin/sites/:siteSlug/articles/:id/revert-to-draft` (EDT-013;
   * CTR-008) — transição `PENDING_REVIEW → DRAFT`.
   *
   * Mesmos guards/`@MinRole('EDITOR')` de `submitForReview()` — mesma
   * justificativa (fluxo normal de edição, nunca toca `ARCHIVED`).
   * Incondicional. `NOT_FOUND` → `404`, `WRONG_STATUS` → `409`.
   */
  @Post(':id/revert-to-draft')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(HttpStatus.OK)
  async revertToDraft(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.revertArticleToDraftUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(REVERT_TO_DRAFT_WRONG_STATUS_MESSAGE);
    }

    return toArticleAdmin(result.article);
  }

  /**
   * `POST /admin/sites/:siteSlug/articles/:id/restore-to-draft` (EDT-016;
   * CTR-008) — transição `ARCHIVED → DRAFT`.
   *
   * `@MinRole('OWNER')`, diferente das outras duas transições: sai do
   * estado `ARCHIVED`, equivalente semanticamente a desarquivar — mesma
   * Role já exigida para arquivar/desarquivar em Categoria/Produto/Oferta
   * (Architecture.md §16, "`OWNER` também arquiva/exclui"), não escrita
   * explicitamente para Artigo mas aplicada aqui por simetria (decisão
   * explícita desta tarefa).
   *
   * Incondicional, sem checklist. `NOT_FOUND` → `404`, `WRONG_STATUS` →
   * `409`.
   */
  @Post(':id/restore-to-draft')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(HttpStatus.OK)
  async restoreToDraft(
    @Param(new ZodValidationPipe(articleParamsSchema))
    params: ArticleParams,
    @Req() req: Request,
  ): Promise<ArticleAdmin> {
    const result = await this.restoreArticleToDraftUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(RESTORE_TO_DRAFT_WRONG_STATUS_MESSAGE);
    }

    return toArticleAdmin(result.article);
  }
}
