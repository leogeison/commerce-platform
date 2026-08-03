import { Injectable } from '@nestjs/common';
import { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado nos demais
 * casos de uso de Author (nunca o tipo HTTP do contrato).
 */
export interface DeleteAuthorInput {
  siteId: string;
  id: string;
}

export type DeleteAuthorResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_ARTICLES' };

/**
 * Caso de uso de exclusão de Autor (EDT-005) — **não** interno, diferente
 * de `DeleteCategoryUseCase` (CAT-007): `EDT-005` tem controller HTTP
 * próprio (`AuthorsController.delete()`), sem orquestrador cross-domain
 * intermediário, porque `Author` só é referenciado por `Article`
 * (Editorial→Editorial, mesmo domínio) — não há a mesma razão
 * cross-domain que forçou `CAT-007`/`014`/`021` a virarem operações
 * internas (Catalog não podendo depender de Editorial/Tracking).
 *
 * Só delega ao repository: `HAS_ARTICLES`/`NOT_FOUND` já chegam prontos
 * de `PrismaAuthorRepository.deleteBySite` (que já traduziu `P2003`/`P2025`
 * do Prisma) — este caso de uso nunca conhece Prisma nem HTTP.
 */
@Injectable()
export class DeleteAuthorUseCase {
  constructor(private readonly authorRepository: PrismaAuthorRepository) {}

  async execute(input: DeleteAuthorInput): Promise<DeleteAuthorResult> {
    return this.authorRepository.deleteBySite(input.siteId, input.id);
  }
}
