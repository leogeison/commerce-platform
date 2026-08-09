import { Injectable } from '@nestjs/common';
import { PrismaCategoryRepository } from '../infrastructure/prisma-category.repository';
import type { Category } from '../../../generated/prisma/client';

/**
 * Input próprio do caso de uso — não o `PublicCategoryParams` do contrato
 * HTTP, mesmo raciocínio já aplicado em `GetCategoryUseCase`/
 * `GetPublicArticleUseCase`.
 */
export interface GetPublicCategoryInput {
  siteId: string;
  slug: string;
}

/**
 * Caso de uso de detalhe público de Categoria por `slug` (PUB-004).
 *
 * Só delega ao repository e devolve `Category | null` — "não existe" e
 * "existe em outro Site" chegam aqui como o mesmo `null` (o repository já
 * não distingue os dois casos, mesmo raciocínio de `GetCategoryUseCase`/
 * `GetPublicArticleUseCase`). Categoria arquivada **não** é tratada como
 * "não encontrada" aqui nem no repository — decisão explícita da PUB-004
 * (arquivamento não invalida referências históricas). Quem decide que
 * `null` vira `404 Not Found` é o controller (camada HTTP).
 */
@Injectable()
export class GetPublicCategoryUseCase {
  constructor(private readonly categoryRepository: PrismaCategoryRepository) {}

  async execute(input: GetPublicCategoryInput): Promise<Category | null> {
    return this.categoryRepository.findOneBySlug(input.siteId, input.slug);
  }
}
