import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado nos demais
 * casos de uso de Categoria (nunca o tipo HTTP do contrato).
 */
export interface DeleteCategoryInput {
  siteId: string;
  id: string;
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_PRODUCTS' };

/**
 * Caso de uso de exclusão de Categoria (CAT-007) — **interno** do Catalog,
 * sem controller/rota HTTP própria (Architecture.md/backlog: o endpoint
 * real é `APP-006`, cross-domain, fora deste módulo). Nunca importa nada
 * de `@nestjs/common` além de `Injectable`, nunca lança `HttpException` —
 * quem traduz este resultado para HTTP é quem chama (`APP-006`), não este
 * caso de uso, que não conhece HTTP.
 *
 * Só delega ao repository: `HAS_PRODUCTS`/`NOT_FOUND` já chegam prontos do
 * `PrismaCategoryRepository.deleteBySite` (que já traduziu `P2003`/`P2025`
 * do Prisma) — nenhuma verificação de Artigo aqui, de propósito: isso é
 * responsabilidade de `APP-006` (Catalog não pode depender de Editorial).
 */
@Injectable()
export class DeleteCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: DeleteCategoryInput): Promise<DeleteCategoryResult> {
    return this.categoryRepository.deleteBySite(input.siteId, input.id);
  }
}
