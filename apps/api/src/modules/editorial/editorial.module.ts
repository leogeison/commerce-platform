import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CreateArticleUseCase } from './application/create-article.use-case';
import { CreateAuthorUseCase } from './application/create-author.use-case';
import { DeleteAuthorUseCase } from './application/delete-author.use-case';
import { GetArticleUseCase } from './application/get-article.use-case';
import { GetAuthorUseCase } from './application/get-author.use-case';
import { ListArticlesUseCase } from './application/list-articles.use-case';
import { ListAuthorsUseCase } from './application/list-authors.use-case';
import { UpdateArticleUseCase } from './application/update-article.use-case';
import { PrismaArticleRepository } from './infrastructure/prisma-article.repository';
import { PrismaAuthorRepository } from './infrastructure/prisma-author.repository';
import { ArticlesController } from './presentation/articles.controller';
import { AuthorsController } from './presentation/authors.controller';

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
 * Nenhum `exports`: nada em `editorial` é consumido por outro módulo
 * ainda — mesmo critério de `CatalogModule` (exportação entra junto com a
 * tarefa que precisar, não antecipada).
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [AuthorsController, ArticlesController],
  providers: [
    PrismaAuthorRepository,
    CreateAuthorUseCase,
    ListAuthorsUseCase,
    GetAuthorUseCase,
    DeleteAuthorUseCase,
    PrismaArticleRepository,
    CreateArticleUseCase,
    ListArticlesUseCase,
    GetArticleUseCase,
    UpdateArticleUseCase,
  ],
})
export class EditorialModule {}
