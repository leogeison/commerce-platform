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
import { productParamsSchema, type ProductParams } from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { RemoveProductUseCase } from '../application/remove-product.use-case';

const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado.';
const PRODUCT_LINKED_TO_ARTICLE_MESSAGE =
  'Este Produto está vinculado a um ou mais Artigos e não pode ser excluído.';
const PRODUCT_HAS_OFFERS_MESSAGE = 'Este Produto possui Ofertas cadastradas e não pode ser excluído.';

/**
 * `DELETE /admin/sites/:siteSlug/products/:id` (APP-003) — endpoint HTTP
 * real da exclusão cross-domain de Produto.
 *
 * Vive em `ApplicationModule`, não em `ProductsController`/`CatalogModule`
 * — mesmo critério de `ArticleHealthController` (APP-001): exclusão de
 * Produto é cross-domain (verifica vínculo com Artigo, em Editorial,
 * antes de delegar a exclusão física a `CAT-014`, em Catalog), não uma
 * responsabilidade exclusiva do domínio Catalog. Reaproveita
 * `productParamsSchema` (`{ siteSlug, id }`) já existente.
 *
 * Guards/`@MinRole('OWNER')`/`@HttpCode(204)`/`Promise<void>`: mesmo
 * padrão exato de `AuthorsController.delete()` (EDT-005, primeiro
 * precedente de exclusão HTTP do projeto) — `OriginGuard` antes de
 * sessão/banco (mutação), `SiteAuthorizationGuard` por último, `OWNER`
 * (Architecture.md §16/§32: "arquivamento e exclusão exigem OWNER"), sem
 * corpo de resposta em sucesso.
 *
 * `NOT_FOUND` → `404` (mesmo genérico "não existe"/"de outro Site"),
 * `LINKED_TO_ARTICLE`/`HAS_OFFERS` → `409` (conflito de referência, mesma
 * categoria de `HAS_ARTICLES` já usado em `AuthorsController.delete()`).
 */
@Controller('admin/sites/:siteSlug/products')
export class RemoveProductController {
  constructor(private readonly removeProductUseCase: RemoveProductUseCase) {}

  @Delete(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  @HttpCode(204)
  async remove(
    @Param(new ZodValidationPipe(productParamsSchema))
    params: ProductParams,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.removeProductUseCase.execute({
      siteId: req.tenant!.siteId,
      productId: params.id,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'LINKED_TO_ARTICLE') {
        throw new ConflictException(PRODUCT_LINKED_TO_ARTICLE_MESSAGE);
      }

      throw new ConflictException(PRODUCT_HAS_OFFERS_MESSAGE);
    }
  }
}
