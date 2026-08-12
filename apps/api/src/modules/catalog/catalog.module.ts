import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ArchiveCategoryUseCase } from './application/archive-category.use-case';
import { ArchiveOfferUseCase } from './application/archive-offer.use-case';
import { ArchiveProductUseCase } from './application/archive-product.use-case';
import { CreateCategoryUseCase } from './application/create-category.use-case';
import { CreateOfferUseCase } from './application/create-offer.use-case';
import { CreateProductUseCase } from './application/create-product.use-case';
import { DeleteCategoryUseCase } from './application/delete-category.use-case';
import { DeleteOfferUseCase } from './application/delete-offer.use-case';
import { DeleteProductUseCase } from './application/delete-product.use-case';
import { GetCategoryUseCase } from './application/get-category.use-case';
import { GetOfferUseCase } from './application/get-offer.use-case';
import { GetProductUseCase } from './application/get-product.use-case';
import { GetPublicCategoryUseCase } from './application/get-public-category.use-case';
import { ListCategoriesUseCase } from './application/list-categories.use-case';
import { ListOffersUseCase } from './application/list-offers.use-case';
import { ListProductsUseCase } from './application/list-products.use-case';
import { UnarchiveCategoryUseCase } from './application/unarchive-category.use-case';
import { UnarchiveOfferUseCase } from './application/unarchive-offer.use-case';
import { UnarchiveProductUseCase } from './application/unarchive-product.use-case';
import { UpdateCategoryUseCase } from './application/update-category.use-case';
import { UpdateProductUseCase } from './application/update-product.use-case';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { PrismaOfferRepository } from './infrastructure/prisma-offer.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { CategoriesController } from './presentation/categories.controller';
import { OffersController } from './presentation/offers.controller';
import { ProductsController } from './presentation/products.controller';
import { PublicCategoryController } from './presentation/public-category.controller';

/**
 * Primeiro módulo do domínio `catalog` (CAT-001) — até aqui `catalog` não
 * existia na árvore de módulos.
 *
 * `DatabaseModule` importado explicitamente: mesmo motivo documentado em
 * `IdentityModule`/`TenancyModule` — `@Global()`, mas precisa aparecer pelo
 * menos uma vez para `PrismaService` ficar disponível; `PrismaCategoryRepository`
 * depende dele.
 *
 * `IdentityModule`/`TenancyModule` importados para que o Nest resolva a
 * injeção de `SessionAuthGuard` (exportado por `IdentityModule`, AUTH-006)
 * e `SiteAuthorizationGuard` (exportado por `TenancyModule`, AUTH-009) nos
 * `@UseGuards` de `CategoriesController`/`ProductsController`/`OffersController`
 * (os dois últimos desde a CAT-008/CAT-015). `HttpModule` continua
 * necessário pelo `OriginGuard`, mesmo padrão já usado em `IdentityModule`.
 *
 * `exports: [PrismaCategoryRepository, PrismaOfferRepository, DeleteProductUseCase,
 * DeleteCategoryUseCase, DeleteOfferUseCase, UpdateCategoryUseCase,
 * UpdateProductUseCase]` — os dois primeiros desde APP-001 (`ApplicationModule`
 * precisa deles para `CalculateArticleHealthUseCase`); `DeleteProductUseCase`
 * (CAT-014) desde APP-003; `DeleteCategoryUseCase` (CAT-007) desde APP-006;
 * `DeleteOfferUseCase` (CAT-021) desde TRK-010, para `RemoveOfferUseCase`
 * delegar a exclusão física depois de confirmar que não há `AffiliateClick`
 * vinculado — mesmo padrão exato de `DeleteProductUseCase`/APP-003 e
 * `DeleteCategoryUseCase`/APP-006. `UpdateCategoryUseCase` (CAT-004) e
 * `UpdateProductUseCase` (CAT-011) exportados por antecipação explícita:
 * nenhum dos dois tem controller próprio nem nenhuma razão de existir senão
 * ser chamado pelos orquestradores HTTP-facing de atualização em
 * `ApplicationModule` (REV-009/REV-010) — mesmo critério de
 * `MarkArticleAsPublishedUseCase`/`ArchiveArticleUseCase` em `EditorialModule`.
 * `ArchiveProductUseCase`/`UnarchiveProductUseCase` (CAT-012/013) agora
 * também exportados, pelo mesmo critério: sem controller próprio, chamados
 * exclusivamente por `ProductArchiveAndRevalidateUseCase` em
 * `ApplicationModule` (REV-011). `PrismaProductRepository` segue sem
 * exportar — nada em `application` o consome diretamente ainda.
 * `ArchiveOfferUseCase`/`UnarchiveOfferUseCase` (CAT-019/020) seguem sem
 * exportar: serão consumidas por `REV-013` quando essa tarefa existir, mas
 * exportar agora seria antecipar um consumidor que ainda não foi
 * implementado — ficam só registradas como provider, exportação entra
 * junto com a tarefa que precisar delas.
 *
 * `PublicCategoryController`/`GetPublicCategoryUseCase` (PUB-004): leitura
 * pública de Categoria entra no mesmo módulo, não um módulo "public"
 * separado — mesmo raciocínio de `PublicArticlesController` no
 * `EditorialModule` (PUB-002/PUB-003). Usa `PublicTenantGuard`, já
 * disponível via `TenancyModule` (importado desde CAT-001); nenhum wiring
 * novo de módulo necessário. Nenhum export novo.
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [CategoriesController, ProductsController, OffersController, PublicCategoryController],
  providers: [
    PrismaCategoryRepository,
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    GetCategoryUseCase,
    GetPublicCategoryUseCase,
    ArchiveCategoryUseCase,
    UnarchiveCategoryUseCase,
    DeleteCategoryUseCase,
    UpdateCategoryUseCase,
    PrismaProductRepository,
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    ArchiveProductUseCase,
    UnarchiveProductUseCase,
    DeleteProductUseCase,
    UpdateProductUseCase,
    PrismaOfferRepository,
    CreateOfferUseCase,
    ListOffersUseCase,
    GetOfferUseCase,
    ArchiveOfferUseCase,
    UnarchiveOfferUseCase,
    DeleteOfferUseCase,
  ],
  exports: [
    PrismaCategoryRepository,
    PrismaOfferRepository,
    DeleteProductUseCase,
    DeleteCategoryUseCase,
    DeleteOfferUseCase,
    UpdateCategoryUseCase,
    UpdateProductUseCase,
    ArchiveProductUseCase,
    UnarchiveProductUseCase,
  ],
})
export class CatalogModule {}
