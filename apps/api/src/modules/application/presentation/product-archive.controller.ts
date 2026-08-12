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
  productParamsSchema,
  type ProductAdmin,
  type ProductParams,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toProductAdmin } from '../../catalog/presentation/product.presenter';
import { ProductArchiveAndRevalidateUseCase } from '../application/product-archive-and-revalidate.use-case';

const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado.';

/**
 * `POST /admin/sites/:siteSlug/products/:id/archive` e
 * `POST /admin/sites/:siteSlug/products/:id/unarchive` (REV-011) — único
 * caminho HTTP que persiste `archivedAt` de `Product`, nos dois sentidos.
 * Vive em `ApplicationModule`, não em `ProductsController`/`CatalogModule`
 * — mesmo critério de `UpdateProductController`. Coexiste com
 * `ProductsController`/`UpdateProductController` no mesmo prefixo de rota.
 *
 * Uma única classe cobrindo os dois endpoints (mesma tarefa de backlog),
 * mas dois métodos explícitos — nenhum despacho genérico entre `archive`/
 * `unarchive`.
 *
 * `@MinRole('OWNER')`: arquivar/desarquivar é ação administrativa de maior
 * privilégio, mesma Role já exigida para arquivar Categoria/Artigo —
 * diferente do `EDITOR` de `create()`/`UpdateProductController`.
 *
 * `NOT_FOUND` → `404`, único motivo de falha possível
 * (`ArchiveProductUseCase`/`UnarchiveProductUseCase` são idempotentes —
 * nunca há conflito de estado, ver `ProductArchiveAndRevalidateUseCase`).
 *
 * Retorna `ProductAdmin` "raso", mesmo formato de
 * `ProductsController.create()`/`UpdateProductController`.
 */
@Controller('admin/sites/:siteSlug/products')
export class ProductArchiveController {
  constructor(
    private readonly productArchiveAndRevalidateUseCase: ProductArchiveAndRevalidateUseCase,
  ) {}

  @Post(':id/archive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async archive(
    @Param(new ZodValidationPipe(productParamsSchema))
    params: ProductParams,
    @Req() req: Request,
  ): Promise<ProductAdmin> {
    const result = await this.productArchiveAndRevalidateUseCase.archive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return toProductAdmin(result.product);
  }

  @Post(':id/unarchive')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(200)
  async unarchive(
    @Param(new ZodValidationPipe(productParamsSchema))
    params: ProductParams,
    @Req() req: Request,
  ): Promise<ProductAdmin> {
    const result = await this.productArchiveAndRevalidateUseCase.unarchive({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.id,
    });

    if (!result.ok) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return toProductAdmin(result.product);
  }
}
