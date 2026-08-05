import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EditorialModule } from '../editorial/editorial.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { HttpModule } from '../../shared/http/http.module';
import { CalculateArticleHealthUseCase } from './application/calculate-article-health.use-case';
import { FindAffectedPublishedArticlesUseCase } from './application/find-affected-published-articles.use-case';
import { PrepareAffiliateRedirectUseCase } from './application/prepare-affiliate-redirect.use-case';
import { PublishArticleUseCase } from './application/publish-article.use-case';
import { RemoveProductUseCase } from './application/remove-product.use-case';
import { ArticleHealthController } from './presentation/article-health.controller';
import { RemoveProductController } from './presentation/remove-product.controller';

/**
 * Primeiro módulo do bounded context `application` (APP-001,
 * Architecture.md §14) — camada de orquestração cross-domain, fora de
 * qualquer domínio específico.
 *
 * Mantido deliberadamente mínimo, sem copiar por simetria os imports de
 * `CatalogModule`/`EditorialModule`:
 * - `EditorialModule`/`CatalogModule`: consumo real — `CalculateArticleHealthUseCase`
 *   injeta `PrismaArticleRepository`/`PrismaArticleProductRepository`
 *   (exportados por `EditorialModule`) e `PrismaCategoryRepository`/
 *   `PrismaOfferRepository` (exportados por `CatalogModule`).
 * - `IdentityModule`/`TenancyModule`: consumo real — `SessionAuthGuard`
 *   (exportado por `IdentityModule`, AUTH-006) e `SiteAuthorizationGuard`
 *   (exportado por `TenancyModule`, AUTH-009) são usados no `@UseGuards`
 *   de `ArticleHealthController`.
 * - **Sem `DatabaseModule`**: `PrismaService` é `@Global()` (DB-012) e,
 *   além disso, nada aqui injeta `PrismaService` diretamente — só os
 *   repositórios já resolvidos via `EditorialModule`/`CatalogModule`.
 * - `HttpModule` (APP-003, primeira vez neste módulo): `RemoveProductController`
 *   usa `OriginGuard` (`DELETE`, mutação) — mesmo motivo documentado em
 *   `CatalogModule`/`EditorialModule`. `ArticleHealthController` continua
 *   sem precisar dele (`GET` não mutável).
 *
 * `PublishArticleUseCase` (APP-002) entra como provider — reaproveita
 * `CalculateArticleHealthUseCase` (já provider deste módulo) e
 * `MarkArticleAsPublishedUseCase` (exportado por `EditorialModule` desde
 * EDT-014). `RemoveProductUseCase` (APP-003) reaproveita
 * `PrismaArticleProductRepository` (já exportado desde APP-001) e
 * `DeleteProductUseCase` (exportado por `CatalogModule` desde APP-003).
 * Nenhum import novo de módulo necessário para nenhum dos dois além do
 * `HttpModule` acima.
 *
 * `PrepareAffiliateRedirectUseCase` (APP-004) reaproveita
 * `PrismaOfferRepository` (Catalog, já exportado desde APP-001) e
 * `PrismaArticleRepository` (Editorial, já exportado desde APP-001) —
 * nenhum import novo de módulo. Sem controller: `GET /r/:siteSlug/:offerId`
 * é `TRK-002`, fora do escopo desta tarefa.
 *
 * `FindAffectedPublishedArticlesUseCase` (APP-005) reaproveita
 * `PrismaArticleRepository` (já exportado desde APP-001) — nenhum import
 * novo. Sem controller, sem contrato: consumida só por `REV-005` (Fase
 * 14), ainda não implementado.
 *
 * Nenhum `exports` ainda: nada fora de `application` consome
 * `CalculateArticleHealthUseCase`/`PublishArticleUseCase`/`RemoveProductUseCase`/
 * `PrepareAffiliateRedirectUseCase`/`FindAffectedPublishedArticlesUseCase`
 * nesta tarefa — mesma convenção já usada em `CatalogModule`/`EditorialModule`,
 * exportação entra junto com a tarefa que precisar dela.
 */
@Module({
  imports: [IdentityModule, TenancyModule, EditorialModule, CatalogModule, HttpModule],
  controllers: [ArticleHealthController, RemoveProductController],
  providers: [
    CalculateArticleHealthUseCase,
    PublishArticleUseCase,
    RemoveProductUseCase,
    PrepareAffiliateRedirectUseCase,
    FindAffectedPublishedArticlesUseCase,
  ],
})
export class ApplicationModule {}
