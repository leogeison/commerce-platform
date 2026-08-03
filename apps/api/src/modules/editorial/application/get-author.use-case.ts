import { Injectable } from '@nestjs/common';
import { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import type { Author } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso (não o `AuthorParams` do contrato HTTP) —
 * mesmo raciocínio já aplicado em `CreateAuthorUseCase`/`ListAuthorsUseCase`.
 */
export interface GetAuthorInput {
  siteId: string;
  id: string;
}

/**
 * Caso de uso de detalhe de Autor (EDT-003).
 *
 * Só delega ao repository e devolve `Author | null` — "não encontrado" e
 * "pertence a outro Site" chegam aqui como o mesmo `null` (o repository já
 * não distingue os dois casos, mesmo raciocínio de `GetCategoryUseCase`),
 * e o caso de uso não inventa uma distinção que não existe. Quem decide
 * que `null` vira `404 Not Found` é o controller (camada HTTP).
 */
@Injectable()
export class GetAuthorUseCase {
  constructor(private readonly authorRepository: PrismaAuthorRepository) {}

  async execute(input: GetAuthorInput): Promise<Author | null> {
    return this.authorRepository.findOneBySite(input.siteId, input.id);
  }
}
