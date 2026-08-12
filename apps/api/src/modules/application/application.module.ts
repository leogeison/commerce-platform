import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EditorialModule } from '../editorial/editorial.module';
import { IdentityModule } from '../identity/identity.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TrackingModule } from '../tracking/tracking.module';
import { HttpModule } from '../../shared/http/http.module';
import { ArchiveArticleAndRevalidateUseCase } from './application/archive-article-and-revalidate.use-case';
import { CalculateArticleHealthUseCase } from './application/calculate-article-health.use-case';
import { FindAffectedPublishedArticlesUseCase } from './application/find-affected-published-articles.use-case';
import { HandleAffiliateRedirectUseCase } from './application/handle-affiliate-redirect.use-case';
import { PublishArticleUseCase } from './application/publish-article.use-case';
import { PublishArticleAndRevalidateUseCase } from './application/publish-article-and-revalidate.use-case';
import { RemoveCategoryUseCase } from './application/remove-category.use-case';
import { RemoveOfferUseCase } from './application/remove-offer.use-case';
import { RemoveProductUseCase } from './application/remove-product.use-case';
import { RevalidateAffectedArticlesUseCase } from './application/revalidate-affected-articles.use-case';
import { UpdateCategoryAndRevalidateUseCase } from './application/update-category-and-revalidate.use-case';
import { UpdateProductAndRevalidateUseCase } from './application/update-product-and-revalidate.use-case';
import { ProductArchiveAndRevalidateUseCase } from './application/product-archive-and-revalidate.use-case';
import { UpdateOfferAndRevalidateUseCase } from './application/update-offer-and-revalidate.use-case';
import { OfferArchiveAndRevalidateUseCase } from './application/offer-archive-and-revalidate.use-case';
import { UpdateAuthorAndRevalidateUseCase } from './application/update-author-and-revalidate.use-case';
import { AffiliateRedirectController } from './presentation/affiliate-redirect.controller';
import { ArchiveArticleController } from './presentation/archive-article.controller';
import { ArticleHealthController } from './presentation/article-health.controller';
import { PublishArticleController } from './presentation/publish-article.controller';
import { ProductArchiveController } from './presentation/product-archive.controller';
import { OfferArchiveController } from './presentation/offer-archive.controller';
import { RemoveCategoryController } from './presentation/remove-category.controller';
import { RemoveOfferController } from './presentation/remove-offer.controller';
import { RemoveProductController } from './presentation/remove-product.controller';
import { UpdateCategoryController } from './presentation/update-category.controller';
import { UpdateOfferController } from './presentation/update-offer.controller';
import { UpdateProductController } from './presentation/update-product.controller';
import { UpdateAuthorController } from './presentation/update-author.controller';

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
 * `HandleAffiliateRedirectUseCase` (APP-004; renomeada de
 * `PrepareAffiliateRedirectUseCase` em `TRK-004`, quando passou a também
 * registrar o `AffiliateClick`, não só validar) reaproveita
 * `PrismaOfferRepository` (Catalog, já exportado desde APP-001) e
 * `PrismaArticleRepository` (Editorial, já exportado desde APP-001).
 * `AffiliateRedirectController` (`GET /r/:siteSlug/:offerId`) entra em
 * `controllers` só nesta tarefa (`TRK-006`) — `TRK-002` a `TRK-005`
 * construíram o método incrementalmente sem registrar a rota, para nunca
 * deixar `OFFER_ARCHIVED` sem resposta HTTP válida numa rota já pública
 * (ver o próprio arquivo do controller). `TrackingModule` (import desde
 * `TRK-004`) fornece `AFFILIATE_CLICK_RECORDER`, consumido por
 * `HandleAffiliateRedirectUseCase` para registrar o `AffiliateClick`, e
 * `AFFILIATE_CLICK_EXISTENCE_CHECKER` (desde `TRK-010`), consumido por
 * `RemoveOfferUseCase` para verificar clique antes de excluir — direção
 * `Application → Tracking` nos dois casos, nunca o inverso (o motivo pelo
 * qual `RemoveOfferUseCase`, cross-domain Tracking+Catalog, vive aqui, não
 * dentro de `TrackingModule` nem de `CatalogModule`).
 *
 * `FindAffectedPublishedArticlesUseCase` (APP-005) reaproveita
 * `PrismaArticleRepository` (já exportado desde APP-001) — nenhum import
 * novo. Sem controller, sem contrato: consumida por
 * `RevalidateAffectedArticlesUseCase`.
 *
 * `RevalidateAffectedArticlesUseCase` é o mecanismo de coordenação
 * reutilizável para os orquestradores HTTP-facing de Categoria/Produto/
 * Oferta/Autor (`REV-009` a `REV-014`, só `REV-009` implementada até aqui):
 * descobre Artigos publicados afetados via `FindAffectedPublishedArticlesUseCase`
 * (já provider deste módulo) e tenta revalidar cada um via `RevalidationPort`
 * (`RevalidationModule`). Sem controller, sem contrato próprio — não é um
 * endpoint em si. Como a mudança de origem já está persistida por quem
 * chama antes desta classe rodar, nenhuma falha (descoberta ou revalidação)
 * propaga; tudo é capturado e logado. Nenhum `exports` ainda: nenhum
 * consumidor fora deste módulo.
 *
 * `UpdateCategoryAndRevalidateUseCase` (REV-009) é o único caminho HTTP que
 * persiste alterações de `Category`: atualiza via `UpdateCategoryUseCase`
 * (exportado por `CatalogModule`) e, em caso de sucesso, aciona
 * `RevalidateAffectedArticlesUseCase.revalidateForCategory` (já provider
 * deste módulo). `UpdateCategoryController`
 * (`PATCH .../categories/:id`) é seu único consumidor HTTP —
 * `UpdateCategoryUseCase` nunca é injetado diretamente por nenhum
 * controller. Diferente de `PublishArticleAndRevalidateUseCase`/
 * `ArchiveArticleAndRevalidateUseCase` (que chamam `RevalidationPort`
 * diretamente e por isso têm `try/catch`/`Logger` próprios),
 * `UpdateCategoryAndRevalidateUseCase` não precisa de nenhum dos dois —
 * `RevalidateAffectedArticlesUseCase` já garante que nunca propaga e já
 * loga internamente.
 *
 * `RemoveCategoryUseCase` (APP-006) reaproveita `PrismaArticleRepository`
 * (Editorial, já exportado desde APP-001) e `DeleteCategoryUseCase`
 * (Catalog, exportado desde APP-006) — nenhum import novo de módulo,
 * mesmos moldes exatos de `RemoveProductUseCase`/APP-003.
 *
 * `RemoveOfferUseCase` (TRK-010) reaproveita `PrismaOfferRepository`
 * (Catalog, já exportado desde APP-001) e `DeleteOfferUseCase` (Catalog,
 * exportado desde TRK-010) + `AFFILIATE_CLICK_EXISTENCE_CHECKER`
 * (Tracking, exportado desde TRK-010) — nenhum import novo de módulo.
 * Mais simples que `RemoveProductUseCase`/`RemoveCategoryUseCase`: `Offer`
 * só tem uma FK externa possível, então não precisa da reconsulta pós-corrida
 * que os outros dois fazem (ver o próprio caso de uso).
 *
 * `PublishArticleAndRevalidateUseCase` é o único caminho HTTP que persiste
 * `PUBLISHED`: publica via `PublishArticleUseCase` (já provider deste
 * módulo) e, em caso de sucesso, revalida via `RevalidationPort`
 * (`RevalidationModule`). `PublishArticleController`
 * (`POST .../articles/:id/publish`) é seu único consumidor HTTP —
 * `PublishArticleUseCase` nunca é injetado diretamente por nenhum
 * controller, então não existe caminho alternativo para persistir
 * `PUBLISHED` sem revalidar.
 *
 * `ArchiveArticleAndRevalidateUseCase` é, pelo mesmo critério, o único
 * caminho HTTP que persiste `ARCHIVED`: arquiva via `ArchiveArticleUseCase`
 * (exportado por `EditorialModule`) e, em caso de sucesso, revalida via
 * `RevalidationPort`. `ArchiveArticleController`
 * (`POST .../articles/:id/archive`) é seu único consumidor HTTP —
 * `ArchiveArticleUseCase` nunca é injetado diretamente por nenhum
 * controller. Nenhuma abstração nova é compartilhada entre os dois
 * orquestradores de revalidação — cada um mantém sua própria classe,
 * injeta `RevalidationPort` independentemente e loga sua própria falha; o
 * paralelismo entre eles é só de padrão, não de código.
 *
 * `UpdateProductAndRevalidateUseCase` (REV-010) é, pelo mesmo critério de
 * `UpdateCategoryAndRevalidateUseCase`, o único caminho HTTP que persiste
 * alterações de `Product`: atualiza via `UpdateProductUseCase` (exportado
 * por `CatalogModule` desde CAT-011) e, em caso de sucesso, aciona
 * `RevalidateAffectedArticlesUseCase.revalidateForProduct` (já provider
 * deste módulo). `UpdateProductController` (`PATCH .../products/:id`) é seu
 * único consumidor HTTP — `UpdateProductUseCase` nunca é injetado
 * diretamente por nenhum controller. Sem `try/catch`/`Logger` própria, pela
 * mesma razão de `UpdateCategoryAndRevalidateUseCase`. Nenhuma abstração
 * nova compartilhada entre os dois orquestradores de atualização — cada um
 * mantém sua própria classe.
 *
 * `ProductArchiveAndRevalidateUseCase` (REV-011) é, pelo mesmo critério dos
 * dois orquestradores de atualização, o único caminho HTTP que persiste
 * `archivedAt` de `Product`, nos dois sentidos: `archive()` chama
 * `ArchiveProductUseCase` (CAT-012), `unarchive()` chama
 * `UnarchiveProductUseCase` (CAT-013) — ambos exportados por `CatalogModule`
 * desde REV-011 — e, em caso de sucesso (`Product` não nulo, incluindo o
 * sucesso idempotente de arquivar um Produto já arquivado ou desarquivar um
 * já ativo), aciona `RevalidateAffectedArticlesUseCase.revalidateForProduct`
 * (já provider deste módulo). `ProductArchiveController`
 * (`POST .../products/:id/archive` e `/unarchive`) é seu único consumidor
 * HTTP — nem `ArchiveProductUseCase` nem `UnarchiveProductUseCase` são
 * injetados diretamente por nenhum controller. Uma única classe cobre os
 * dois endpoints (mesma tarefa de backlog), mas os dois métodos permanecem
 * explícitos, sem despacho genérico entre eles. Sem `try/catch`/`Logger`
 * própria, pela mesma razão dos demais orquestradores baseados em
 * `RevalidateAffectedArticlesUseCase`.
 *
 * `UpdateOfferAndRevalidateUseCase` (REV-012) é, pelo mesmo critério dos
 * demais orquestradores de atualização, o único caminho HTTP que persiste
 * alterações de `Offer`: atualiza via `UpdateOfferUseCase` (exportado por
 * `CatalogModule` desde CAT-018) e, em caso de sucesso, aciona
 * `RevalidateAffectedArticlesUseCase.revalidateForOffer` (já provider deste
 * módulo). `UpdateOfferController`
 * (`PATCH .../products/:productId/offers/:id`) é seu único consumidor HTTP
 * — `UpdateOfferUseCase` nunca é injetado diretamente por nenhum
 * controller. Sem `try/catch`/`Logger` própria, pela mesma razão dos
 * demais orquestradores baseados em `RevalidateAffectedArticlesUseCase`.
 * Nenhuma abstração nova compartilhada com os outros orquestradores de
 * atualização — cada um mantém sua própria classe.
 *
 * `OfferArchiveAndRevalidateUseCase` (REV-013) é, pelo mesmo critério de
 * `ProductArchiveAndRevalidateUseCase`, o único caminho HTTP que persiste
 * `archivedAt` de `Offer`, nos dois sentidos: `archive()` chama
 * `ArchiveOfferUseCase` (CAT-019), `unarchive()` chama
 * `UnarchiveOfferUseCase` (CAT-020) — ambos exportados por `CatalogModule`
 * desde REV-013 — e, em caso de sucesso (`Offer` não nula, incluindo o
 * sucesso idempotente de arquivar uma Oferta já arquivada ou desarquivar
 * uma já ativa), aciona `RevalidateAffectedArticlesUseCase.revalidateForOffer`
 * (já provider deste módulo). `OfferArchiveController`
 * (`POST .../products/:productId/offers/:id/archive` e `/unarchive`) é seu
 * único consumidor HTTP — nem `ArchiveOfferUseCase` nem
 * `UnarchiveOfferUseCase` são injetados diretamente por nenhum controller.
 * Uma única classe cobre os dois endpoints, mas os dois métodos permanecem
 * explícitos, sem despacho genérico entre eles. Sem `try/catch`/`Logger`
 * própria. Nenhuma abstração compartilhada com
 * `ProductArchiveAndRevalidateUseCase` — cada orquestrador de
 * arquivamento mantém sua própria classe, mesmo padrão de duas rotas por
 * classe, código independente.
 *
 * `UpdateAuthorAndRevalidateUseCase` (REV-014) é, pelo mesmo critério dos
 * demais orquestradores de atualização, o único caminho HTTP que persiste
 * alterações de `Author`: atualiza via `UpdateAuthorUseCase` (exportado por
 * `EditorialModule` desde EDT-004) e, em caso de sucesso, aciona
 * `RevalidateAffectedArticlesUseCase.revalidateForAuthor` (já provider
 * deste módulo). `UpdateAuthorController` (`PATCH .../authors/:id`) é seu
 * único consumidor HTTP — `UpdateAuthorUseCase` nunca é injetado
 * diretamente por nenhum controller. Sem `try/catch`/`Logger` própria, pela
 * mesma razão dos demais orquestradores baseados em
 * `RevalidateAffectedArticlesUseCase`. Nenhuma abstração nova compartilhada
 * com os outros orquestradores de atualização — cada um mantém sua própria
 * classe. `Author.userId` reproduz exatamente a mesma regra de tenancy já
 * estabelecida em `EDT-001` (sem checagem de `SiteUser`/membership),
 * decisão não revisitada por esta tarefa.
 *
 * Nenhum `exports` ainda: nada fora de `application` consome os providers
 * deste módulo — mesma convenção já usada em `CatalogModule`/`EditorialModule`,
 * exportação entra junto com a tarefa que precisar dela.
 */
@Module({
  imports: [
    IdentityModule,
    TenancyModule,
    EditorialModule,
    CatalogModule,
    TrackingModule,
    RevalidationModule,
    HttpModule,
  ],
  controllers: [
    ArticleHealthController,
    RemoveProductController,
    RemoveCategoryController,
    AffiliateRedirectController,
    RemoveOfferController,
    PublishArticleController,
    ArchiveArticleController,
    UpdateCategoryController,
    UpdateProductController,
    ProductArchiveController,
    UpdateOfferController,
    OfferArchiveController,
    UpdateAuthorController,
  ],
  providers: [
    CalculateArticleHealthUseCase,
    PublishArticleUseCase,
    RemoveProductUseCase,
    HandleAffiliateRedirectUseCase,
    FindAffectedPublishedArticlesUseCase,
    RemoveCategoryUseCase,
    RemoveOfferUseCase,
    PublishArticleAndRevalidateUseCase,
    ArchiveArticleAndRevalidateUseCase,
    RevalidateAffectedArticlesUseCase,
    UpdateCategoryAndRevalidateUseCase,
    UpdateProductAndRevalidateUseCase,
    ProductArchiveAndRevalidateUseCase,
    UpdateOfferAndRevalidateUseCase,
    OfferArchiveAndRevalidateUseCase,
    UpdateAuthorAndRevalidateUseCase,
  ],
})
export class ApplicationModule {}
