import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createProductRequestSchema,
  productsSiteParamsSchema,
  type CreateProductRequest,
  type ProductAdmin,
  type ProductsSiteParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateProductUseCase } from '../application/create-product.use-case';
import { toProductAdmin } from './product.presenter';

const SLUG_CONFLICT_MESSAGE = 'Já existe um produto com este slug neste Site.';
const CATEGORY_NOT_FOUND_MESSAGE =
  'categoryId inválido: a Categoria não existe ou não pertence a este Site.';

/**
 * `POST /admin/sites/:siteSlug/products` (CAT-008; CTR-004).
 *
 * Mesma ordem de guards/`@MinRole('EDITOR')` de `CategoriesController.create()`
 * (CAT-001): Origin antes de sessão/banco, `SiteAuthorizationGuard` por
 * último, criar é escrita de conteúdo (não ação administrativa do Site).
 *
 * `siteId` vem exclusivamente de `req.tenant!.siteId`, nunca do body —
 * mesma disciplina de tenant isolation já usada em Categoria.
 *
 * Sem pré-checagem de slug/`categoryId`: o repository resolve os dois
 * conflitos de forma reativa (tenta inserir, traduz `P2002`/`P2003`) — este
 * controller só traduz o resultado tipado para HTTP: `SLUG_CONFLICT` →
 * `409`, `CATEGORY_NOT_FOUND` → `422` (valor de entrada semanticamente
 * inválido — referência que não existe/não pertence ao Site — decisão
 * explícita da CAT-008, mesma categoria de erro que payload malformado).
 */
@Controller('admin/sites/:siteSlug/products')
export class ProductsController {
  constructor(private readonly createProductUseCase: CreateProductUseCase) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(productsSiteParamsSchema))
    _params: ProductsSiteParams,
    @Body(new ZodValidationPipe(createProductRequestSchema))
    body: CreateProductRequest,
    @Req() req: Request,
  ): Promise<ProductAdmin> {
    const result = await this.createProductUseCase.execute({
      siteId: req.tenant!.siteId,
      categoryId: body.categoryId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      imageUrl: body.imageUrl,
    });

    if (!result.ok) {
      if (result.reason === 'SLUG_CONFLICT') {
        throw new ConflictException(SLUG_CONFLICT_MESSAGE);
      }

      throw new UnprocessableEntityException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toProductAdmin(result.product);
  }
}
