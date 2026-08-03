import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CreateAuthorUseCase } from './application/create-author.use-case';
import { GetAuthorUseCase } from './application/get-author.use-case';
import { ListAuthorsUseCase } from './application/list-authors.use-case';
import { PrismaAuthorRepository } from './infrastructure/prisma-author.repository';
import { AuthorsController } from './presentation/authors.controller';

/**
 * Primeiro módulo do domínio `editorial` (EDT-001) — até aqui `editorial`
 * não existia na árvore de módulos.
 *
 * `DatabaseModule`/`IdentityModule`/`TenancyModule`/`HttpModule`
 * importados pelo mesmo motivo documentado em `CatalogModule`: `PrismaService`
 * precisa aparecer pelo menos uma vez, `SessionAuthGuard`/`SiteAuthorizationGuard`
 * usados nos `@UseGuards` de `AuthorsController` precisam ser resolvidos
 * pelo Nest, `OriginGuard` depende do `HttpModule`.
 *
 * Nenhum `exports`: nada em `editorial` é consumido por outro módulo
 * ainda — mesmo critério de `CatalogModule` (exportação entra junto com a
 * tarefa que precisar, não antecipada).
 */
@Module({
  imports: [DatabaseModule, HttpModule, IdentityModule, TenancyModule],
  controllers: [AuthorsController],
  providers: [PrismaAuthorRepository, CreateAuthorUseCase, ListAuthorsUseCase, GetAuthorUseCase],
})
export class EditorialModule {}
