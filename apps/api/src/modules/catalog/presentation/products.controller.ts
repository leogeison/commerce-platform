import {
  Body,
  ConflictException,
  Controller,
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
  createProductRequestSchema,
  listProductsQuerySchema,
  productParamsSchema,
  productsSiteParamsSchema,
  type CreateProductRequest,
  type ListProductsQuery,
  type ListProductsResponse,
  type ProductAdmin,
  type ProductDetailAdmin,
  type ProductParams,
  type ProductsSiteParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { CreateProductUseCase } from '../application/create-product.use-case';
import { GetProductUseCase } from '../application/get-product.use-case';
import { ListProductsUseCase } from '../application/list-products.use-case';
import { toProductAdmin, toProductDetailAdmin } from './product.presenter';

const SLUG_CONFLICT_MESSAGE = 'Já existe um produto com este slug neste Site.';
const CATEGORY_NOT_FOUND_MESSAGE =
  'categoryId inválido: a Categoria não existe ou não pertence a este Site.';
const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado.';

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
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductUseCase: GetProductUseCase,
  ) {}

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

  /**
   * `GET /admin/sites/:siteSlug/products` (CAT-009; CTR-004).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `CategoriesController.list()`
   * (CAT-002): `GET` não mutável, sem `OriginGuard`, leitura mínima da
   * hierarquia.
   *
   * Itens "rasos" (`productAdminSchema`, sem `offers`) — o resumo de
   * ofertas só aparece no detalhe (`productDetailAdminSchema`, CAT-010).
   *
   * `categoryId`/`archived` ausentes não filtram; presentes, filtram
   * exatamente por aquele valor. Um `categoryId` válido mas de outro Site
   * não dá erro — só não bate em nenhum Produto deste Site, lista vazia.
   */
  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async list(
    @Param(new ZodValidationPipe(productsSiteParamsSchema))
    _params: ProductsSiteParams,
    @Query(new ZodValidationPipe(listProductsQuerySchema))
    query: ListProductsQuery,
    @Req() req: Request,
  ): Promise<ListProductsResponse> {
    const result = await this.listProductsUseCase.execute({
      siteId: req.tenant!.siteId,
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      archived: query.archived,
    });

    return {
      items: result.items.map(toProductAdmin),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * `GET /admin/sites/:siteSlug/products/:id` (CAT-010; CTR-004).
   *
   * Mesmos guards/`@MinRole('VIEWER')` de `list()`. `productParamsSchema`
   * (com `id`), mesmo padrão de `CategoriesController.detail()` (CAT-003).
   *
   * `404` genérico para "não existe"/"de outro Site", mesmo critério já
   * usado em Categoria. Resposta inclui `offers` (ativas e arquivadas,
   * ordenadas por `createdAt asc, id asc`) — única rota de Produto que
   * inclui ofertas; criar/listar/arquivar/desarquivar usam `ProductAdmin`
   * "raso".
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async detail(
    @Param(new ZodValidationPipe(productParamsSchema))
    params: ProductParams,
    @Req() req: Request,
  ): Promise<ProductDetailAdmin> {
    const product = await this.getProductUseCase.execute({
      siteId: req.tenant!.siteId,
      id: params.id,
    });

    if (!product) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return toProductDetailAdmin(product);
  }
}
