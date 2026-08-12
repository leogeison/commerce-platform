import { Injectable } from '@nestjs/common';
import { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import type { Author } from '../../../generated/prisma/client';

export interface UpdateAuthorInput {
  siteId: string;
  id: string;
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
}

export type UpdateAuthorResult =
  | { ok: true; author: Author }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'USER_ALREADY_HAS_AUTHOR' }
  | { ok: false; reason: 'USER_NOT_FOUND' };

/**
 * Caso de uso INTERNO de atualização de Autor (EDT-004) — sem controller
 * próprio, mesmo padrão de `UpdateOfferUseCase` (CAT-018): as guards/
 * `@MinRole` e a coordenação de revalidação ficam inteiramente no
 * orquestrador HTTP-facing (`UpdateAuthorAndRevalidateUseCase`, REV-014),
 * único chamador autorizado.
 *
 * Só delega ao repository — sem regra de negócio adicional além do que já
 * está descrito em `PrismaAuthorRepository.updateBySite` (tri-state de
 * `bio`/`avatarUrl`/`userId`, mesma regra de tenancy de `userId` já
 * estabelecida em `create()`, sem checagem de `SiteUser`/membership).
 */
@Injectable()
export class UpdateAuthorUseCase {
  constructor(private readonly authorRepository: PrismaAuthorRepository) {}

  async execute(input: UpdateAuthorInput): Promise<UpdateAuthorResult> {
    return this.authorRepository.updateBySite(input);
  }
}
