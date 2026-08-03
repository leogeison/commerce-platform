import { Injectable } from '@nestjs/common';
import { PrismaAuthorRepository } from '../infrastructure/prisma-author.repository';
import type { Author } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `ListAuthorsQuery` do contrato HTTP
 * (`packages/contracts`). Mesmo raciocínio já aplicado em
 * `ListCategoriesUseCase`: o caso de uso não deve depender do tipo da
 * camada de transporte; o controller é quem traduz `ListAuthorsQuery` (já
 * validado pelo `ZodValidationPipe`) para este input.
 */
export interface ListAuthorsInput {
  siteId: string;
  page: number;
  pageSize: number;
}

export interface ListAuthorsResult {
  items: Author[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Caso de uso de listagem paginada de Autor (EDT-002).
 *
 * `totalPages` calculado aqui, mesmo raciocínio de `ListCategoriesUseCase`:
 * `Math.ceil(total / pageSize)` é cálculo puro sobre números já devolvidos
 * pelo repository — não pertence a `PrismaAuthorRepository` (não é
 * conhecimento de Prisma) nem a `author.presenter.ts` (não é formatação de
 * item, é metadado de paginação).
 */
@Injectable()
export class ListAuthorsUseCase {
  constructor(private readonly authorRepository: PrismaAuthorRepository) {}

  async execute(input: ListAuthorsInput): Promise<ListAuthorsResult> {
    const { items, total } = await this.authorRepository.findManyBySite({
      siteId: input.siteId,
      page: input.page,
      pageSize: input.pageSize,
    });

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }
}
