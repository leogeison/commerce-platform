import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';

/**
 * Input próprio do caso de uso — mesmo raciocínio já aplicado nos demais
 * casos de uso de Produto.
 */
export interface DeleteProductInput {
  siteId: string;
  id: string;
}

export type DeleteProductResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_OFFERS' };

/**
 * Caso de uso de exclusão de Produto (CAT-014) — **interno** do Catalog,
 * sem controller/rota HTTP própria (o endpoint real é `APP-003`,
 * cross-domain, fora deste módulo). Espelha `DeleteCategoryUseCase`
 * (CAT-007): só delega ao repository, nunca importa nada de
 * `@nestjs/common` além de `Injectable`, nunca lança `HttpException` — não
 * conhece HTTP.
 *
 * `HAS_OFFERS`/`NOT_FOUND` já chegam prontos do
 * `PrismaProductRepository.deleteBySite` (que já traduziu `P2003`/`P2025`
 * do Prisma) — nenhuma verificação de Artigo aqui, de propósito: isso é
 * responsabilidade de `APP-003` (Catalog não pode depender de Editorial).
 */
@Injectable()
export class DeleteProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: DeleteProductInput): Promise<DeleteProductResult> {
    return this.productRepository.deleteBySite(input.siteId, input.id);
  }
}
