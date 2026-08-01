import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CreateCategoryUseCase } from './application/create-category.use-case';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { CategoriesController } from './presentation/categories.controller';

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
 * `@UseGuards` do `CategoriesController`. `HttpModule` continua necessário
 * pelo `OriginGuard`, mesmo padrão já usado em `IdentityModule`.
 *
 * Nenhum `exports`: nada em `catalog` é consumido por outro módulo ainda
 * (diferente de `SessionAuthGuard`/`SiteAuthorizationGuard`, que existem
 * justamente para serem reaproveitados entre módulos).
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [CategoriesController],
  providers: [PrismaCategoryRepository, CreateCategoryUseCase],
})
export class CatalogModule {}
