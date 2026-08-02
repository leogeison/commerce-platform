import { Injectable } from '@nestjs/common';
import { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import type { Author } from '../../../generated/prisma/client';

export interface CreateAuthorInput {
  siteId: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  userId?: string;
}

export type CreateAuthorResult =
  | { ok: true; author: Author }
  | { ok: false; reason: 'USER_ALREADY_HAS_AUTHOR' }
  | { ok: false; reason: 'USER_NOT_FOUND' };

/**
 * Caso de uso de criação de Autor (EDT-001).
 *
 * Só delega ao repository, mesmo padrão de `CreateCategoryUseCase`/
 * `CreateProductUseCase` — nenhuma regra de negócio adicional documentada
 * além do que `createAuthorRequestSchema` (CTR-006) já exige na forma.
 * Nunca conhece `P2002`/`P2003`/Prisma nem o detalhe de driver adapter
 * usado para distingui-los: `PrismaAuthorRepository` já traduz os dois
 * casos relevantes para `{ ok: false, reason: ... }` antes de chegar aqui.
 */
@Injectable()
export class CreateAuthorUseCase {
  constructor(private readonly authorRepository: PrismaAuthorRepository) {}

  async execute(input: CreateAuthorInput): Promise<CreateAuthorResult> {
    return this.authorRepository.create(input);
  }
}
