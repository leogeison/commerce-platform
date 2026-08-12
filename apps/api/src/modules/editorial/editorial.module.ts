import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ArchiveArticleUseCase } from './application/archive-article.use-case';
import { CreateArticleUseCase } from './application/create-article.use-case';
import { CreateAuthorUseCase } from './application/create-author.use-case';
import { DeleteAuthorUseCase } from './application/delete-author.use-case';
import { GetArticleUseCase } from './application/get-article.use-case';
import { GetAuthorUseCase } from './application/get-author.use-case';
import { GetPublicArticleUseCase } from './application/get-public-article.use-case';
import { LinkArticleProductUseCase } from './application/link-article-product.use-case';
import { ListArticlesUseCase } from './application/list-articles.use-case';
import { ListAuthorsUseCase } from './application/list-authors.use-case';
import { ListPublicArticlesUseCase } from './application/list-public-articles.use-case';
import { MarkArticleAsPublishedUseCase } from './application/mark-article-as-published.use-case';
import { ReorderArticleProductsUseCase } from './application/reorder-article-products.use-case';
import { RestoreArticleToDraftUseCase } from './application/restore-article-to-draft.use-case';
import { RevertArticleToDraftUseCase } from './application/revert-article-to-draft.use-case';
import { SubmitArticleForReviewUseCase } from './application/submit-article-for-review.use-case';
import { UnlinkArticleProductUseCase } from './application/unlink-article-product.use-case';
import { UpdateArticleUseCase } from './application/update-article.use-case';
import { PrismaArticleProductRepository } from './infrastructure/prisma-article-product.repository';
import { PrismaArticleRepository } from './infrastructure/prisma-article.repository';
import { PrismaAuthorRepository } from './infrastructure/prisma-author.repository';
import { ArticlesController } from './presentation/articles.controller';
import { AuthorsController } from './presentation/authors.controller';
import { PublicArticlesController } from './presentation/public-articles.controller';

/**
 * Primeiro módulo do domínio `editorial` (EDT-001) — até aqui `editorial`
 * não existia na árvore de módulos.
 *
 * `DatabaseModule`/`IdentityModule`/`TenancyModule`/`HttpModule`
 * importados pelo mesmo motivo documentado em `CatalogModule`: `PrismaService`
 * precisa aparecer pelo menos uma vez, `SessionAuthGuard`/`SiteAuthorizationGuard`
 * usados nos `@UseGuards` de `AuthorsController`/`ArticlesController` precisam
 * ser resolvidos pelo Nest, `OriginGuard` depende do `HttpModule`.
 *
 * `ArticlesController`/`PrismaArticleRepository`/`CreateArticleUseCase`
 * (EDT-006) entram no mesmo módulo de Author — `Article` é a segunda
 * entidade do domínio Editorial, sem módulo próprio (mesmo critério de
 * `CatalogModule`, que agrupa Categoria/Produto/Oferta).
 *
 * `exports: [PrismaArticleRepository, PrismaArticleProductRepository,
 * MarkArticleAsPublishedUseCase, ArchiveArticleUseCase]` — os dois
 * repositórios exportados porque `ApplicationModule` precisa deles para
 * `CalculateArticleHealthUseCase`. `MarkArticleAsPublishedUseCase` e
 * `ArchiveArticleUseCase` são exportados por antecipação explícita (decisão
 * do usuário): nenhum dos dois tem controller próprio nem qualquer razão de
 * existir senão ser chamado pelos orquestradores HTTP-facing de publicação e
 * arquivamento em `ApplicationModule`. Nenhum outro provider é exportado.
 *
 * `PublicArticlesController`/`ListPublicArticlesUseCase` (PUB-002) e
 * `GetPublicArticleUseCase` (PUB-003): leitura pública de Artigo entra no
 * mesmo módulo, não um módulo "public" separado — `Article` já é dono
 * deste domínio, mesmo raciocínio de manter `ArticlesController` (admin)
 * aqui. Usa `PublicTenantGuard`, já exportado por `TenancyModule`
 * (importado desde EDT-001); nenhum wiring novo de módulo necessário.
 * Nenhum export novo — nenhum outro módulo consome esses providers.
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [AuthorsController, ArticlesController, PublicArticlesController],
  providers: [
    PrismaAuthorRepository,
    CreateAuthorUseCase,
    ListAuthorsUseCase,
    GetAuthorUseCase,
    DeleteAuthorUseCase,
    PrismaArticleRepository,
    CreateArticleUseCase,
    ListArticlesUseCase,
    ListPublicArticlesUseCase,
    GetPublicArticleUseCase,
    GetArticleUseCase,
    UpdateArticleUseCase,
    PrismaArticleProductRepository,
    LinkArticleProductUseCase,
    UnlinkArticleProductUseCase,
    ReorderArticleProductsUseCase,
    SubmitArticleForReviewUseCase,
    RevertArticleToDraftUseCase,
    RestoreArticleToDraftUseCase,
    MarkArticleAsPublishedUseCase,
    ArchiveArticleUseCase,
  ],
  exports: [
    PrismaArticleRepository,
    PrismaArticleProductRepository,
    MarkArticleAsPublishedUseCase,
    ArchiveArticleUseCase,
  ],
})
export class EditorialModule {}
