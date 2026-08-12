import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  productParamsSchema,
  updateProductRequestSchema,
  type ProductAdmin,
  type ProductParams,
  type UpdateProductRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toProductAdmin } from '../../catalog/presentation/product.presenter';
import { UpdateProductAndRevalidateUseCase } from '../application/update-product-and-revalidate.use-case';

const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado.';
const SLUG_CONFLICT_MESSAGE = 'Já existe um produto com este slug neste Site.';
const CATEGORY_NOT_FOUND_MESSAGE =
  'categoryId inválido: a Categoria não existe ou não pertence a este Site.';

/**
 * `PATCH /admin/sites/:siteSlug/products/:id` (REV-010) — único caminho
 * HTTP que persiste alterações de `Product`. Vive em `ApplicationModule`,
 * não em `ProductsController`/`CatalogModule` — mesmo critério de
 * `UpdateCategoryController`/REV-009: a operação atravessa Catalog
 * (atualização em si) e a coordenação de revalidação. Coexiste com
 * `ProductsController` no mesmo prefixo de rota.
 *
 * `@MinRole('EDITOR')`: atualizar é escrita de conteúdo, mesma Role de
 * `ProductsController.create()` — diferente do `OWNER` exigido para
 * arquivar/excluir.
 *
 * `NOT_FOUND` → `404`. `SLUG_CONFLICT` → `409`. `CATEGORY_NOT_FOUND` →
 * `422` — mesmas três traduções já usadas em `ProductsController.create()`.
 *
 * Retorna `ProductAdmin` "raso" (sem `offers`), mesmo formato de
 * `ProductsController.create()`/`list()` — só `detail()` inclui `offers`.
 */
@Controller('admin/sites/:siteSlug/products')
export class UpdateProductController {
  constructor(
    private readonly updateProductAndRevalidateUseCase: UpdateProductAndRevalidateUseCase,
  ) {}

  @Patch(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(
    @Param(new ZodValidationPipe(productParamsSchema))
    params: ProductParams,
    @Body(new ZodValidationPipe(updateProductRequestSchema))
    body: UpdateProductRequest,
    @Req() req: Request,
  ): Promise<ProductAdmin> {
    const result = await this.updateProductAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      productId: params.id,
      name: body.name,
      slug: body.slug,
      categoryId: body.categoryId,
      description: body.description,
      imageUrl: body.imageUrl,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'SLUG_CONFLICT') {
        throw new ConflictException(SLUG_CONFLICT_MESSAGE);
      }

      throw new UnprocessableEntityException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    return toProductAdmin(result.product);
  }
}
