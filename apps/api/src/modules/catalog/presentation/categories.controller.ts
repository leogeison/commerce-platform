import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  categoriesSiteParamsSchema,
  createCategoryRequestSchema,
  type CategoriesSiteParams,
  type CategoryAdmin,
  type CreateCategoryRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateCategoryUseCase } from '../application/create-category.use-case';
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
  constructor(private readonly createCategoryUseCase: CreateCategoryUseCase) {}

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
}
