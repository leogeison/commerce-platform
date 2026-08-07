import {
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { offerParamsSchema, type OfferParams } from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { RemoveOfferUseCase } from '../application/remove-offer.use-case';

const OFFER_NOT_FOUND_MESSAGE = 'Oferta não encontrada.';
const OFFER_HAS_CLICKS_MESSAGE =
  'Esta Oferta possui cliques registrados e não pode ser excluída.';

/**
 * `DELETE /admin/sites/:siteSlug/products/:productId/offers/:id` (TRK-010)
 * — único endpoint HTTP real da exclusão de Oferta, mesmos moldes exatos de
 * `RemoveProductController` (APP-003)/`RemoveCategoryController` (APP-006).
 *
 * Vive em `ApplicationModule`, não em `OffersController`/`CatalogModule` —
 * exclusão de Oferta é cross-domain (verifica existência de
 * `AffiliateClick`, em Tracking, antes de delegar a exclusão física a
 * `CAT-021`, em Catalog), não uma responsabilidade exclusiva do domínio
 * Catalog. Reaproveita `offerParamsSchema` (`{ siteSlug, productId, id }`)
 * já existente — nenhum contrato novo.
 *
 * Guards/`@MinRole('OWNER')`/`@HttpCode(204)`/`Promise<void>`: mesmo padrão
 * exato de `RemoveProductController`/`RemoveCategoryController` —
 * `OriginGuard` antes de sessão/banco (mutação), `SiteAuthorizationGuard`
 * por último, `OWNER` (Architecture.md §16/§32: "arquivamento e exclusão
 * exigem OWNER"), sem corpo de resposta em sucesso.
 *
 * `NOT_FOUND` → `404` (cobre "não existe"/"de outro Site"/"de outro
 * Produto" — `RemoveOfferUseCase` já localiza por `siteId` + `productId` +
 * `id` juntos), `HAS_CLICKS` → `409` (conflito de referência, mesma
 * categoria de `HAS_OFFERS`/`LINKED_TO_ARTICLE` já usada nos outros dois
 * controllers de exclusão).
 */
@Controller('admin/sites/:siteSlug/products/:productId/offers')
export class RemoveOfferController {
  constructor(private readonly removeOfferUseCase: RemoveOfferUseCase) {}

  @Delete(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(204)
  async remove(
    @Param(new ZodValidationPipe(offerParamsSchema))
    params: OfferParams,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.removeOfferUseCase.execute({
      siteId: req.tenant!.siteId,
      productId: params.productId,
      offerId: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
      }

      throw new ConflictException(OFFER_HAS_CLICKS_MESSAGE);
    }
  }
}
