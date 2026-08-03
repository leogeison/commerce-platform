import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  authorParamsSchema,
  authorsSiteParamsSchema,
  createAuthorRequestSchema,
  listAuthorsQuerySchema,
  type AuthorAdmin,
  type AuthorParams,
  type AuthorsSiteParams,
  type CreateAuthorRequest,
  type ListAuthorsQuery,
  type ListAuthorsResponse,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateAuthorUseCase } from '../application/create-author.use-case';
import { DeleteAuthorUseCase } from '../application/delete-author.use-case';
import { GetAuthorUseCase } from '../application/get-author.use-case';
import { ListAuthorsUseCase } from '../application/list-authors.use-case';
import { toAuthorAdmin } from './author.presenter';

const USER_ALREADY_HAS_AUTHOR_MESSAGE =
  'Este usuário já possui um Author neste Site.';
const USER_NOT_FOUND_MESSAGE = 'userId inválido: o usuário não existe.';
const AUTHOR_NOT_FOUND_MESSAGE = 'Autor não encontrado.';
const AUTHOR_HAS_ARTICLES_MESSAGE =
  'Este Autor está vinculado a um ou mais Artigos e não pode ser excluído.';

/**
 * `POST /admin/sites/:siteSlug/authors` (EDT-001; CTR-006).
 *
 * Mesma ordem de guards/`@MinRole('EDITOR')` de `CategoriesController.create()`/
 * `ProductsController.create()`: `OriginGuard` antes de sessão/banco,
 * `SiteAuthorizationGuard` por último (depende de `request.auth`), criar
 * Author é escrita de conteúdo — regra geral do Architecture.md §16
 * ("`EDITOR` cria/edita"), não ação administrativa do Site.
 *
 * `siteId` vem exclusivamente de `req.tenant!.siteId`, nunca do body —
 * mesma disciplina de tenant isolation já usada em Categoria/Produto/Oferta.
 *
 * Sem pré-checagem de `userId`: o repository resolve os dois conflitos de
 * forma reativa (tenta inserir, traduz `P2002`/`P2003` só quando a
 * constraint específica é identificada com segurança — ver
 * `PrismaAuthorRepository`) — este controller só traduz o resultado
 * tipado para HTTP: `USER_ALREADY_HAS_AUTHOR` → `409` (conflito de
 * unicidade, mesma categoria de `SLUG_CONFLICT` em Categoria/Produto),
 * `USER_NOT_FOUND` → `422` (referência que não existe — mesmo status e
 * justificativa já usados em `CATEGORY_NOT_FOUND` de
 * `ProductsController.create()`: "mesma categoria de erro que payload
 * malformado").
 */
@Controller('admin/sites/:siteSlug/authors')
export class AuthorsController {
  constructor(
    private readonly createAuthorUseCase: CreateAuthorUseCase,
    private readonly listAuthorsUseCase: ListAuthorsUseCase,
    private readonly getAuthorUseCase: GetAuthorUseCase,
    private readonly deleteAuthorUseCase: DeleteAuthorUseCase,
  ) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(authorsSiteParamsSchema))
    _params: AuthorsSiteParams,
    @Body(new ZodValidationPipe(createAuthorRequestSchema))
    body: CreateAuthorRequest,
    @Req() req: Request,
  ): Promise<AuthorAdmin> {
    const result = await this.createAuthorUseCase.execute({
      siteId: req.tenant!.siteId,
      name: body.name,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
      userId: body.userId,
    });

    if (!result.ok) {
      if (result.reason === 'USER_ALREADY_HAS_AUTHOR') {
        throw new ConflictException(USER_ALREADY_HAS_AUTHOR_MESSAGE);
      }

      throw new UnprocessableEntityException(USER_NOT_FOUND_MESSAGE);
    }

    return toAuthorAdmin(result.author);
  }

  /**
   * `GET /admin/sites/:siteSlug/authors` (EDT-002; CTR-006).
   *
   * Só `SessionAuthGuard, SiteAuthorizationGuard` (sem `OriginGuard`): `GET`
   * não é mutável, mesmo critério já usado em `CategoriesController.list()`.
   *
   * `@MinRole('VIEWER')`: a Role mínima da hierarquia — listar é leitura,
   * mesma regra geral do Architecture.md §16 ("VIEWER lê") já aplicada em
   * Categoria/Produto/Oferta.
   *
   * `listAuthorsQuerySchema` já aplica os defaults (`page: 1, pageSize:
   * 20`) antes de chegar aqui — sem `archived`/nenhum outro filtro
   * (`EDT-002`: "sem filtro"), diferente de Categoria/Produto.
   */
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async list(
    @Param(new ZodValidationPipe(authorsSiteParamsSchema))
    _params: AuthorsSiteParams,
    @Query(new ZodValidationPipe(listAuthorsQuerySchema))
    query: ListAuthorsQuery,
    @Req() req: Request,
  ): Promise<ListAuthorsResponse> {
    const result = await this.listAuthorsUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items.map(toAuthorAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * `GET /admin/sites/:siteSlug/authors/:id` (EDT-003; CTR-006).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `list()`: `GET` não mutável, sem
   * `OriginGuard`, leitura mínima da hierarquia.
   *
   * `authorParamsSchema` (não `authorsSiteParamsSchema`): a única
   * diferença entre as duas rotas é o `id` — o pipe já garante `422` para
   * um `id` que não seja UUID, antes de chegar ao repository.
   *
   * `404` genérico para "não existe" e "existe, mas é de outro Site":
   * `GetAuthorUseCase`/`findOneBySite` já devolvem o mesmo `null` para os
   * dois casos (mesmo raciocínio de isolamento já usado em
   * `CategoriesController.detail()`) — o controller nunca tenta distinguir
   * o que o caso de uso já não distingue.
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async detail(
    @Param(new ZodValidationPipe(authorParamsSchema))
    params: AuthorParams,
    @Req() req: Request,
  ): Promise<AuthorAdmin> {
    const author = await this.getAuthorUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!author) {
      throw new NotFoundException(AUTHOR_NOT_FOUND_MESSAGE);
    }

    return toAuthorAdmin(author);
  }

  /**
   * `DELETE /admin/sites/:siteSlug/authors/:id` (EDT-005; CTR-006).
   *
   * Primeiro endpoint de exclusão HTTP-exposto do projeto — diferente de
   * `CAT-007`/`014`/`021` (Categoria/Produto/Oferta), que são internos sem
   * controller próprio, porque a única entidade que referencia `Author`
   * (`Article`) é do mesmo domínio Editorial; não existe a razão
   * cross-domain que forçou aquelas a virarem operações internas.
   *
   * `OriginGuard, SessionAuthGuard, SiteAuthorizationGuard`, mesma ordem
   * de toda operação mutável do projeto (`create()`, e
   * archive/unarchive de Categoria/Produto/Oferta) — exclusão física é
   * mutação, não uma leitura, então segue a mesma regra, sem exceção.
   *
   * `@MinRole('OWNER')`: regra geral do Architecture.md §16 ("`OWNER`
   * também arquiva/exclui") e §32 ("arquivamento e exclusão exigem
   * `OWNER`"), mesmo critério já usado em `CategoriesController.archive()`.
   *
   * `@HttpCode(204)`, `Promise<void>`: exclusão física bem-sucedida não
   * tem corpo de resposta — não há um "Author atualizado" pra ecoar de
   * volta, diferente de archive/unarchive (que preservam o registro).
   *
   * Sem pré-checagem de Artigo vinculado: o repository resolve de forma
   * reativa (tenta excluir, traduz `P2003`/`P2025` — ver
   * `PrismaAuthorRepository.deleteBySite`) — este controller só traduz o
   * resultado tipado para HTTP: `NOT_FOUND` → `404` (mesmo `404` genérico
   * de `detail()`, "não existe"/"de outro Site"), `HAS_ARTICLES` → `409`
   * (conflito de referência, mesma categoria de `HAS_PRODUCTS`/`HAS_OFFERS`
   * já usados internamente em Categoria/Produto).
   */
  @Delete(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(204)
  async delete(
    @Param(new ZodValidationPipe(authorParamsSchema))
    params: AuthorParams,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.deleteAuthorUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(AUTHOR_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(AUTHOR_HAS_ARTICLES_MESSAGE);
    }
  }
}
