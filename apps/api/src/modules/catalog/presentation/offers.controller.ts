import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createOfferRequestSchema,
  offersProductParamsSchema,
  type CreateOfferRequest,
  type OfferAdmin,
  type OffersProductParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateOfferUseCase } from '../application/create-offer.use-case';
import { toOfferAdmin } from './offer.presenter';

const PRODUCT_NOT_FOUND_MESSAGE =
  'Produto não encontrado: o productId não existe ou não pertence a este Site.';

/**
 * `POST /admin/sites/:siteSlug/products/:productId/offers` (CAT-015;
 * CTR-005).
 *
 * Mesma ordem de guards/`@MinRole('EDITOR')` de
 * `ProductsController.create()`/`CategoriesController.create()`: criar é
 * escrita de conteúdo.
 *
 * `siteId` vem exclusivamente de `req.tenant!.siteId`, nunca do body —
 * mesma disciplina de tenant isolation já usada em Categoria/Produto.
 *
 * Sem pré-checagem de Produto: o repository resolve o conflito de forma
 * reativa (tenta inserir, traduz `P2003`) — este controller só traduz
 * `{ ok: false, reason: 'PRODUCT_NOT_FOUND' }` para `404` (não `422`,
 * diferente do `categoryId` inválido em `CreateProductUseCase`:
 * `productId` aqui é parâmetro de rota, identifica o recurso pai sob o
 * qual a Oferta está aninhada — mesmo critério já usado para "recurso
 * referenciado pela URL não existe", decisão explícita da CAT-015).
 */
@Controller('admin/sites/:siteSlug/products/:productId/offers')
export class OffersController {
  constructor(private readonly createOfferUseCase: CreateOfferUseCase) {}

  @Post()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  async create(
    @Param(new ZodValidationPipe(offersProductParamsSchema))
    params: OffersProductParams,
    @Body(new ZodValidationPipe(createOfferRequestSchema))
    body: CreateOfferRequest,
    @Req() req: Request,
  ): Promise<OfferAdmin> {
    const result = await this.createOfferUseCase.execute({
      siteId: req.tenant!.siteId,
      productId: params.productId,
      marketplace: body.marketplace,
      price: body.price,
      currency: body.currency,
      affiliateUrl: body.affiliateUrl,
      inStock: body.inStock,
    });

    if (!result.ok) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return toOfferAdmin(result.offer);
  }
}
