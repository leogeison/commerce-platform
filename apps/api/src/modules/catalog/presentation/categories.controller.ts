import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  categoriesSiteParamsSchema,
  categoryParamsSchema,
  listCategoriesQuerySchema,
  type CategoriesSiteParams,
  type CategoryAdmin,
  type CategoryParams,
  type ListCategoriesQuery,
  type ListCategoriesResponse,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { GetCategoryUseCase } from '../application/get-category.use-case';
import { ListCategoriesUseCase } from '../application/list-categories.use-case';
import { toCategoryAdmin } from './category.presenter';

const CATEGORY_NOT_FOUND_MESSAGE = 'Categoria não encontrada.';

/**
 * `POST /admin/sites/:siteSlug/categories`,
 * `POST /admin/sites/:siteSlug/categories/:id/archive` e
 * `POST /admin/sites/:siteSlug/categories/:id/unarchive` saíram deste
 * controller na UXF-010A: os três agora vivem em `CreateCategoryController`/
 * `CategoryArchiveController`, em `application/presentation`, porque
 * passaram a depender de `CreateCategoryAndRevalidateUseCase`/
 * `CategoryArchiveAndRevalidateUseCase` (cross-domain Catalog + coordenação
 * de revalidação) — mesmo critério já usado por `UpdateCategoryController`
 * desde REV-009. Este controller mantém só leitura (`list()`/`detail()`),
 * que nunca precisou de coordenação de revalidação.
 */
@Controller('admin/sites/:siteSlug/categories')
export class CategoriesController {
  constructor(
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly getCategoryUseCase: GetCategoryUseCase,
  ) {}

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

  /**
   * `GET /admin/sites/:siteSlug/categories/:id` (CAT-003; CTR-003).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `list()`: `GET` não mutável, sem
   * `OriginGuard`, leitura mínima da hierarquia.
   *
   * `categoryParamsSchema` (não `categoriesSiteParamsSchema`): a única
   * diferença entre as duas rotas é o `id` — o pipe já garante `422` para
   * um `id` que não seja UUID, antes até de chegar ao repository.
   *
   * `404` genérico para "não existe" e "existe, mas é de outro Site":
   * `GetCategoryUseCase`/`findOneBySite` já devolvem o mesmo `null` para os
   * dois casos (decisão explícita da CAT-003, mesmo raciocínio de
   * isolamento da AUTH-010) — o controller nunca tenta distinguir o que o
   * caso de uso já não distingue.
   *
   * Categoria arquivada (`archivedAt` preenchido) continua sendo detalhada
   * normalmente com `200` — `archivedAt` é só um campo do estado, não um
   * filtro de visibilidade nesta rota (ao contrário da listagem, CAT-002,
   * onde `archived` é um filtro explícito e opcional).
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async detail(
    @Param(new ZodValidationPipe(categoryParamsSchema))
    params: CategoryParams,
    @Req() req: Request,
  ): Promise<CategoryAdmin> {
    const category = await this.getCategoryUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!category) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toCategoryAdmin(category);
  }
}
