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
import { ListCategoriesUseCase } from './application/list-categories.use-case';
import { ListOffersUseCase } from './application/list-offers.use-case';
import { ListProductsUseCase } from './application/list-products.use-case';
import { UnarchiveCategoryUseCase } from './application/unarchive-category.use-case';
import { UnarchiveOfferUseCase } from './application/unarchive-offer.use-case';
import { UnarchiveProductUseCase } from './application/unarchive-product.use-case';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { PrismaOfferRepository } from './infrastructure/prisma-offer.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { CategoriesController } from './presentation/categories.controller';
import { OffersController } from './presentation/offers.controller';
import { ProductsController } from './presentation/products.controller';

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
 * `exports: [PrismaCategoryRepository, PrismaOfferRepository]` (APP-001) —
 * primeira vez que `catalog` exporta algo: `ApplicationModule` precisa dos
 * dois para `CalculateArticleHealthUseCase` (checar Categoria ativa e
 * Ofertas válidas dos Produtos vinculados ao Artigo). `PrismaProductRepository`
 * segue sem exportar — nada em `application` o consome diretamente ainda
 * (a lista de `productId`s do Artigo vem de `ArticleProduct`, via
 * `editorial`, não de `Product` diretamente). `DeleteCategoryUseCase`
 * (CAT-007), `ArchiveProductUseCase`/`UnarchiveProductUseCase` (CAT-012/013),
 * `DeleteProductUseCase` (CAT-014), `ArchiveOfferUseCase`/
 * `UnarchiveOfferUseCase` (CAT-019/020) e `DeleteOfferUseCase` (CAT-021)
 * inclusive: serão consumidas por `APP-006`/`REV-011`/`APP-003`/`REV-013`/
 * `TRK-010` (cross-domain) quando essas tarefas existirem, mas exportar
 * agora seria antecipar consumidores que ainda não foram implementados —
 * ficam só registradas como provider, exportação entra junto com a tarefa
 * que precisar delas.
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [CategoriesController, ProductsController, OffersController],
  providers: [
    PrismaCategoryRepository,
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    GetCategoryUseCase,
    ArchiveCategoryUseCase,
    UnarchiveCategoryUseCase,
    DeleteCategoryUseCase,
    PrismaProductRepository,
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    ArchiveProductUseCase,
    UnarchiveProductUseCase,
    DeleteProductUseCase,
    PrismaOfferRepository,
    CreateOfferUseCase,
    ListOffersUseCase,
    GetOfferUseCase,
    ArchiveOfferUseCase,
    UnarchiveOfferUseCase,
    DeleteOfferUseCase,
  ],
  exports: [PrismaCategoryRepository, PrismaOfferRepository],
})
export class CatalogModule {}
