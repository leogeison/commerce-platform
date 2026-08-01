import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

export interface CreateCategoryInput {
  siteId: string;
  name: string;
  slug: string;
}

export type CreateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'SLUG_CONFLICT' };

/**
 * Caso de uso de criação de Categoria (CAT-001).
 *
 * Hoje só delega ao repository — nenhuma regra de negócio adicional
 * documentada para validar/normalizar `name`/`slug` além do que a CTR-003
 * já exige na forma (não vazio). Mantido como caso de uso próprio (não
 * inlinado no controller) porque o backlog já lista `application/` como
 * área esperada do módulo `catalog`, e é o ponto de extensão natural se uma
 * regra de negócio real aparecer numa tarefa futura — sem precisar mover
 * lógica do controller pra cá depois.
 *
 * Nunca conhece `P2002`/Prisma: o `PrismaCategoryRepository` já traduz o
 * conflito de slug para `{ ok: false, reason: 'SLUG_CONFLICT' }` antes de
 * chegar aqui.
 */
@Injectable()
export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryResult> {
    return this.categoryRepository.create(input);
  }
}
