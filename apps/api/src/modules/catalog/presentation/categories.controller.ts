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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  categoriesSiteParamsSchema,
  createCategoryRequestSchema,
  listCategoriesQuerySchema,
  type CategoriesSiteParams,
  type CategoryAdmin,
  type CreateCategoryRequest,
  type ListCategoriesQuery,
  type ListCategoriesResponse,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateCategoryUseCase } from '../application/create-category.use-case';
import { ListCategoriesUseCase } from '../application/list-categories.use-case';
import { toCategoryAdmin } from './category.presenter';

const SLUG_CONFLICT_MESSAGE = 'Já existe uma categoria com este slug neste Site.';

/**
 * `POST /admin/sites/:siteSlug/categories` (CAT-001; CTR-003).
 *
 * Ordem de guards `OriginGuard, SessionAuthGuard, SiteAuthorizationGuard`
 * (mesma ordem já estabelecida na AUTH-007/AUTH-009 para rotas mutáveis
 * administrativas): Origin é a rejeição mais barata, verificada antes de
 * tocar sessão/banco; `SiteAuthorizationGuard` roda por último porque
 * depende de `request.auth` já resolvido pelo `SessionAuthGuard`.
 *
 * `@MinRole('EDITOR')`: criar Categoria é uma escrita de conteúdo, não uma
 * ação administrativa do Site em si (que exigiria `OWNER`) — critério já
 * usado implicitamente na hierarquia de Role (`tenancy/domain/role-hierarchy.ts`).
 *
 * `siteId` vem exclusivamente de `req.tenant!.siteId` (anexado pelo
 * `SiteAuthorizationGuard`), nunca do parâmetro de rota `siteSlug` bruto nem
 * de qualquer campo do corpo — mesma disciplina de tenant isolation da
 * AUTH-009/AUTH-010.
 *
 * `categoriesSiteParamsSchema` valida a forma do parâmetro de rota antes do
 * guard rodar (o `ZodValidationPipe` de `@Param` executa na resolução dos
 * argumentos, mas o `SiteAuthorizationGuard` já rodou antes disso, ambos
 * lendo o mesmo `request.params.siteSlug` cru) — a validação aqui é só
 * checagem de forma (`min(1)`), redundante com o guard só na coincidência
 * de nome, não um mecanismo de segurança adicional.
 *
 * Sem pré-checagem de slug existente: o repository já resolve o conflito de
 * forma reativa (tenta inserir, traduz `P2002`) — este controller só
 * traduz `{ ok: false, reason: 'SLUG_CONFLICT' }` para `409 Conflict`.
 */
@Controller('admin/sites/:siteSlug/categories')
export class CategoriesController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
  ) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(categoriesSiteParamsSchema))
    _params: CategoriesSiteParams,
    @Body(new ZodValidationPipe(createCategoryRequestSchema))
    body: CreateCategoryRequest,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const result = await this.createCategoryUseCase.execute({
      siteId: req.tenant!.siteId,
      name: body.name,
      slug: body.slug,
    });

    if (!result.ok) {
      throw new ConflictException(SLUG_CONFLICT_MESSAGE);
    }

    return toCategoryAdmin(result.category);
  }

  /**
   * `GET /admin/sites/:siteSlug/categories` (CAT-002; CTR-003).
   *
   * Só `SessionAuthGuard, SiteAuthorizationGuard` (sem `OriginGuard`): `GET`
   * não é mutável, mesmo critério já usado em `GET /admin/auth/me`
   * (AUTH-008) e nas rotas `GET` de `site-isolation.e2e-spec.ts`.
   *
   * `@MinRole('VIEWER')`: a Role mínima da hierarquia — listar é leitura,
   * critério explícito do bloco comum CAT-001–007 do backlog ("VIEWER
   * lê").
   *
   * `listCategoriesQuerySchema` já aplica os defaults (`page: 1, pageSize:
   * 20`) e a coerção de `archived` antes de chegar aqui — o handler nunca
   * lida com strings de query cruas.
   */
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async list(
    @Param(new ZodValidationPipe(categoriesSiteParamsSchema))
    _params: CategoriesSiteParams,
    @Query(new ZodValidationPipe(listCategoriesQuerySchema))
    query: ListCategoriesQuery,
    @Req() req: Request,
  ): Promise<ListCategoriesResponse> {
    const result = await this.listCategoriesUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
      archived: query.archived,
    });

    return {
      items: result.items.map(toCategoryAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }
}
