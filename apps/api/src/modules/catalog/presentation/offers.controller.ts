import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createOfferRequestSchema,
  listOffersQuerySchema,
  offerParamsSchema,
  offersProductParamsSchema,
  type CreateOfferRequest,
  type ListOffersQuery,
  type ListOffersResponse,
  type OfferAdmin,
  type OfferParams,
  type OffersProductParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateOfferUseCase } from '../application/create-offer.use-case';
import { GetOfferUseCase } from '../application/get-offer.use-case';
import { ListOffersUseCase } from '../application/list-offers.use-case';
import { toOfferAdmin } from './offer.presenter';

const PRODUCT_NOT_FOUND_MESSAGE =
  'Produto não encontrado: o productId não existe ou não pertence a este Site.';
const OFFER_NOT_FOUND_MESSAGE = 'Oferta não encontrada.';

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
  constructor(
    private readonly createOfferUseCase: CreateOfferUseCase,
    private readonly listOffersUseCase: ListOffersUseCase,
    private readonly getOfferUseCase: GetOfferUseCase,
  ) {}

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

  /**
   * `GET /admin/sites/:siteSlug/products/:productId/offers` (CAT-016;
   * CTR-005).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `ProductsController.list()`
   * (CAT-009): `GET` não mutável, sem `OriginGuard`, leitura mínima da
   * hierarquia.
   *
   * Sem filtros — só `page`/`pageSize` (Architecture.md: "Ofertas: nenhum
   * [filtro]"). Ofertas arquivadas aparecem na lista, sem tratamento
   * especial.
   *
   * Diferente de `ProductsController.list()`: `productId` aqui não é
   * filtro, é o recurso-pai da rota — inexistente ou de outro Site é
   * `404`, nunca lista vazia (mesmo critério já usado em `create()` acima,
   * decisão explícita da CAT-016).
   */
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async list(
    @Param(new ZodValidationPipe(offersProductParamsSchema))
    params: OffersProductParams,
    @Query(new ZodValidationPipe(listOffersQuerySchema))
    query: ListOffersQuery,
    @Req() req: Request,
  ): Promise<ListOffersResponse> {
    const result = await this.listOffersUseCase.execute({
      siteId: req.tenant!.siteId,
      productId: params.productId,
      page: query.page,
      pageSize: query.pageSize,
    });

    if (!result.ok) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return {
      items: result.items.map(toOfferAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * `GET /admin/sites/:siteSlug/products/:productId/offers/:id` (CAT-017;
   * CTR-005).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `list()`. `offerParamsSchema`
   * (com `id`), mesmo padrão de `CategoriesController.detail()`/
   * `ProductsController.detail()`.
   *
   * `404` genérico para "não existe"/"de outro Site"/"de outro Produto"
   * (sem pré-checagem do Produto) — mesmo critério documentado em
   * `PrismaOfferRepository.findOneByProductAndSite`. Oferta arquivada
   * retorna `200` normalmente.
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async detail(
    @Param(new ZodValidationPipe(offerParamsSchema))
    params: OfferParams,
    @Req() req: Request,
  ): Promise<OfferAdmin> {
    const offer = await this.getOfferUseCase.execute({
      siteId: req.tenant!.siteId,
      productId: params.productId,
      id: params.id,
    });

    if (!offer) {
      throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
    }

    return toOfferAdmin(offer);
  }
}
