import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  offerParamsSchema,
  updateOfferRequestSchema,
  type OfferAdmin,
  type OfferParams,
  type UpdateOfferRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toOfferAdmin } from '../../catalog/presentation/offer.presenter';
import { UpdateOfferAndRevalidateUseCase } from '../application/update-offer-and-revalidate.use-case';

const OFFER_NOT_FOUND_MESSAGE = 'Oferta não encontrada.';

/**
 * `PATCH /admin/sites/:siteSlug/products/:productId/offers/:id` — único
 * caminho HTTP que persiste alterações de `Offer`. Vive em
 * `ApplicationModule`, não em `OffersController`/`CatalogModule` — mesmo
 * critério de `UpdateProductController`/`UpdateCategoryController`: a
 * operação atravessa Catalog (atualização em si) e a coordenação de
 * revalidação. Coexiste com `OffersController` no mesmo prefixo de rota.
 *
 * `@MinRole('EDITOR')`: atualizar é escrita de conteúdo, mesma Role de
 * `OffersController.create()` — diferente do `OWNER` exigido para
 * arquivar/excluir.
 *
 * `NOT_FOUND` → `404` — único motivo de falha possível, cobrindo três
 * casos com a mesma resposta genérica: `id` inexistente, `id` de uma
 * Oferta de outro Site, e `id` de uma Oferta que existe e pertence a este
 * Site mas está sob outro Produto (a invariante da rota aninhada,
 * garantida por `PrismaOfferRepository.updateBySite`).
 *
 * Retorna `OfferAdmin`, mesmo formato de `OffersController.create()`/
 * `list()`/`detail()`.
 */
@Controller('admin/sites/:siteSlug/products/:productId/offers')
export class UpdateOfferController {
  constructor(
    private readonly updateOfferAndRevalidateUseCase: UpdateOfferAndRevalidateUseCase,
  ) {}

  @Patch(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(
    @Param(new ZodValidationPipe(offerParamsSchema))
    params: OfferParams,
    @Body(new ZodValidationPipe(updateOfferRequestSchema))
    body: UpdateOfferRequest,
    @Req() req: Request,
  ): Promise<OfferAdmin> {
    const result = await this.updateOfferAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.productId,
      offerId: params.id,
      marketplace: body.marketplace,
      price: body.price,
      currency: body.currency,
      affiliateUrl: body.affiliateUrl,
      inStock: body.inStock,
    });

    if (!result.ok) {
      throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
    }

    return toOfferAdmin(result.offer);
  }
}
