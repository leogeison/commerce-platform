import {
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
  offerParamsSchema,
  type OfferAdmin,
  type OfferParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toOfferAdmin } from '../../catalog/presentation/offer.presenter';
import { OfferArchiveAndRevalidateUseCase } from '../application/offer-archive-and-revalidate.use-case';

const OFFER_NOT_FOUND_MESSAGE = 'Oferta não encontrada.';

/**
 * `POST /admin/sites/:siteSlug/products/:productId/offers/:id/archive` e
 * `POST /admin/sites/:siteSlug/products/:productId/offers/:id/unarchive`
 * (REV-013) — único caminho HTTP que persiste `archivedAt` de `Offer`, nos
 * dois sentidos. Vive em `ApplicationModule`, não em
 * `OffersController`/`CatalogModule` — mesmo critério de
 * `UpdateOfferController`. Coexiste com `OffersController`/
 * `UpdateOfferController` no mesmo prefixo de rota.
 *
 * Uma única classe cobrindo os dois endpoints (mesma tarefa de backlog),
 * mas dois métodos explícitos — nenhum despacho genérico entre `archive`/
 * `unarchive`.
 *
 * `@MinRole('OWNER')`: arquivar/desarquivar é ação administrativa de maior
 * privilégio, mesma Role já exigida para arquivar Categoria/Produto/Artigo
 * — diferente do `EDITOR` de `create()`/`UpdateOfferController`.
 *
 * `NOT_FOUND` → `404`, único motivo de falha possível — cobre "não
 * existe", "de outro Site" e "de outro Produto" (a invariante de
 * identidade contextual garantida por
 * `PrismaOfferRepository.archiveBySite`/`unarchiveBySite`, ver
 * `OfferArchiveAndRevalidateUseCase`).
 *
 * Retorna `OfferAdmin`, mesmo formato de `OffersController.create()`/
 * `list()`/`detail()`/`UpdateOfferController`.
 */
@Controller('admin/sites/:siteSlug/products/:productId/offers')
export class OfferArchiveController {
  constructor(
    private readonly offerArchiveAndRevalidateUseCase: OfferArchiveAndRevalidateUseCase,
  ) {}

  @Post(':id/archive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async archive(
    @Param(new ZodValidationPipe(offerParamsSchema))
    params: OfferParams,
    @Req() req: Request,
  ): Promise<OfferAdmin> {
    const result = await this.offerArchiveAndRevalidateUseCase.archive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.productId,
      offerId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
    }

    return toOfferAdmin(result.offer);
  }

  @Post(':id/unarchive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async unarchive(
    @Param(new ZodValidationPipe(offerParamsSchema))
    params: OfferParams,
    @Req() req: Request,
  ): Promise<OfferAdmin> {
    const result = await this.offerArchiveAndRevalidateUseCase.unarchive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.productId,
      offerId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
    }

    return toOfferAdmin(result.offer);
  }
}
