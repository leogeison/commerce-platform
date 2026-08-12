import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  authorParamsSchema,
  updateAuthorRequestSchema,
  type AuthorAdmin,
  type AuthorParams,
  type UpdateAuthorRequest,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { toAuthorAdmin } from '../../editorial/presentation/author.presenter';
import { UpdateAuthorAndRevalidateUseCase } from '../application/update-author-and-revalidate.use-case';

const AUTHOR_NOT_FOUND_MESSAGE = 'Autor não encontrado.';
const USER_ALREADY_HAS_AUTHOR_MESSAGE = 'Este usuário já possui um Author neste Site.';
const USER_NOT_FOUND_MESSAGE = 'userId inválido: o usuário não existe.';

/**
 * `PATCH /admin/sites/:siteSlug/authors/:id` (REV-014) — único caminho HTTP
 * que persiste alterações de `Author`. Vive em `ApplicationModule`, não em
 * `AuthorsController`/`EditorialModule` — mesmo critério de
 * `UpdateOfferController`/`UpdateProductController`/`UpdateCategoryController`:
 * a operação atravessa Editorial (atualização em si) e a coordenação de
 * revalidação. Coexiste com `AuthorsController` no mesmo prefixo de rota.
 *
 * `@MinRole('EDITOR')`: atualizar é escrita de conteúdo, mesma Role de
 * `AuthorsController.create()` — regra geral do Architecture.md §16
 * ("`EDITOR` cria/edita") — diferente do `OWNER` exigido por
 * `AuthorsController.delete()`.
 *
 * Sem pré-checagem de `userId`: o repository resolve os três casos de forma
 * reativa — este controller só traduz o resultado tipado para HTTP:
 * `NOT_FOUND` → `404` (id inexistente ou de outro Site), `USER_ALREADY_HAS_AUTHOR`
 * → `409` (conflito de unicidade, mesma categoria de `AuthorsController.create()`),
 * `USER_NOT_FOUND` → `422` (referência que não existe, mesmo critério de
 * `AuthorsController.create()`).
 *
 * Retorna `AuthorAdmin`, mesmo formato de `AuthorsController.create()`/
 * `list()`/`detail()`.
 */
@Controller('admin/sites/:siteSlug/authors')
export class UpdateAuthorController {
  constructor(
    private readonly updateAuthorAndRevalidateUseCase: UpdateAuthorAndRevalidateUseCase,
  ) {}

  @Patch(':id')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(
    @Param(new ZodValidationPipe(authorParamsSchema))
    params: AuthorParams,
    @Body(new ZodValidationPipe(updateAuthorRequestSchema))
    body: UpdateAuthorRequest,
    @Req() req: Request,
  ): Promise<AuthorAdmin> {
    const result = await this.updateAuthorAndRevalidateUseCase.execute({
      siteId: req.tenant!.siteId,
      siteSlug: params.siteSlug,
      authorId: params.id,
      name: body.name,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
      userId: body.userId,
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw new NotFoundException(AUTHOR_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'USER_ALREADY_HAS_AUTHOR') {
        throw new ConflictException(USER_ALREADY_HAS_AUTHOR_MESSAGE);
      }

      throw new UnprocessableEntityException(USER_NOT_FOUND_MESSAGE);
    }

    return toAuthorAdmin(result.author);
  }
}
