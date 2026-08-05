import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EditorialModule } from '../editorial/editorial.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CalculateArticleHealthUseCase } from './application/calculate-article-health.use-case';
import { PublishArticleUseCase } from './application/publish-article.use-case';
import { ArticleHealthController } from './presentation/article-health.controller';

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
 * - **Sem `HttpModule`**: só existiria para o `OriginGuard`, e
 *   `ArticleHealthController` não o usa — `GET` não mutável, mesmo
 *   critério de `ArticlesController.detail()`.
 *
 * `PublishArticleUseCase` (APP-002) entra como provider — reaproveita
 * `CalculateArticleHealthUseCase` (já provider deste módulo) e
 * `MarkArticleAsPublishedUseCase` (exportado por `EditorialModule` desde
 * EDT-014). Nenhum import novo necessário: tudo que `PublishArticleUseCase`
 * precisa já estava disponível.
 *
 * Nenhum `exports` ainda: nada fora de `application` consome
 * `CalculateArticleHealthUseCase`/`PublishArticleUseCase` nesta tarefa
 * (`REV-003`, futuro consumidor de `PublishArticleUseCase`, ainda não
 * existe) — mesma convenção já usada em `CatalogModule`/`EditorialModule`,
 * exportação entra junto com a tarefa que precisar dela.
 */
@Module({
  imports: [IdentityModule, TenancyModule, EditorialModule, CatalogModule],
  controllers: [ArticleHealthController],
  providers: [CalculateArticleHealthUseCase, PublishArticleUseCase],
})
export class ApplicationModule {}
