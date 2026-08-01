import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ArchiveCategoryUseCase } from './application/archive-category.use-case';
import { CreateCategoryUseCase } from './application/create-category.use-case';
import { CreateProductUseCase } from './application/create-product.use-case';
import { DeleteCategoryUseCase } from './application/delete-category.use-case';
import { GetCategoryUseCase } from './application/get-category.use-case';
import { ListCategoriesUseCase } from './application/list-categories.use-case';
import { UnarchiveCategoryUseCase } from './application/unarchive-category.use-case';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { CategoriesController } from './presentation/categories.controller';
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
 * `@UseGuards` de `CategoriesController`/`ProductsController` (este último
 * desde a CAT-008). `HttpModule` continua necessário pelo `OriginGuard`,
 * mesmo padrão já usado em `IdentityModule`.
 *
 * Nenhum `exports`: nada em `catalog` é consumido por outro módulo ainda
 * (diferente de `SessionAuthGuard`/`SiteAuthorizationGuard`, que existem
 * justamente para serem reaproveitados entre módulos). `DeleteCategoryUseCase`
 * (CAT-007) inclusive: será consumida por `APP-006` (cross-domain) quando
 * essa tarefa existir, mas exportar agora seria antecipar um consumidor que
 * ainda não foi implementado — fica só registrada como provider, exportação
 * entra junto com a tarefa que precisar dela.
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [CategoriesController, ProductsController],
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
  ],
})
export class CatalogModule {}
