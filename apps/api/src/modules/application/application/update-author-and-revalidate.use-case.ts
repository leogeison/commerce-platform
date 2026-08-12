import { Injectable } from '@nestjs/common';
import {
  UpdateAuthorUseCase,
  type UpdateAuthorResult,
} from '../../editorial/application/update-author.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';

export interface UpdateAuthorAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  authorId: string;
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
}

/**
 * Único caminho HTTP que persiste alterações de `Author`: sempre atualiza
 * e, em seguida — só em caso de sucesso —, aciona a coordenação de
 * revalidação para os Artigos publicados afetados. Cross-domain (Editorial +
 * a coordenação de revalidação), por isso vive em `application`, não em
 * `EditorialModule` — mesmo critério de `UpdateOfferAndRevalidateUseCase`/
 * `UpdateProductAndRevalidateUseCase`/`UpdateCategoryAndRevalidateUseCase`.
 *
 * Sem `try/catch`/`Logger` própria — mesma razão dos demais orquestradores
 * baseados em `RevalidateAffectedArticlesUseCase`: ela já garante, por
 * contrato, que toda falha (descoberta via APP-005 ou revalidação via
 * REV-002) é capturada e logada internamente, e que `Promise<void>` sempre
 * resolve. Falha de persistência (`NOT_FOUND`/`USER_ALREADY_HAS_AUTHOR`/
 * `USER_NOT_FOUND` — nada mudou) significa que a coordenação de revalidação
 * nunca é acionada nesse caso.
 */
@Injectable()
export class UpdateAuthorAndRevalidateUseCase {
  constructor(
    private readonly updateAuthorUseCase: UpdateAuthorUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async execute(input: UpdateAuthorAndRevalidateInput): Promise<UpdateAuthorResult> {
    const result = await this.updateAuthorUseCase.execute({
      siteId: input.siteId,
      id: input.authorId,
      name: input.name,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      userId: input.userId,
    });

    if (!result.ok) {
      return result;
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForAuthor({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      authorId: input.authorId,
    });

    return result;
  }
}
