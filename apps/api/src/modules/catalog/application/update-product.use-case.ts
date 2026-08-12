import { Injectable } from '@nestjs/common';
import { PrismaProductRepository } from '../infrastructure/prisma-product.repository';
import type { Product } from '../../../generated/prisma/client';

export interface UpdateProductInput {
  siteId: string;
  id: string;
  name?: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export type UpdateProductResult =
  | { ok: true; product: Product }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' };

/**
 * Caso de uso INTERNO de atualização de Produto (CAT-011) — sem controller
 * próprio (Architecture.md: "as operações de domínio correspondentes...
 * deixam de ter controller HTTP próprio"). Não conhece autorização,
 * `TenantContext`, revalidação nem `REV-005` — só coordena a persistência
 * pelo repository. Só é chamável pelo orquestrador HTTP-facing que expõe
 * `PATCH /admin/sites/:siteSlug/products/:id` (REV-010), e só depois de
 * suas próprias guards/`@MinRole` já terem autorizado a requisição.
 *
 * Só delega ao repository — sem regra de negócio adicional além do que já
 * está descrito em `PrismaProductRepository.updateBySite` (identidade por
 * `id + siteId`, sem condição de estado, `archivedAt` sempre preservado,
 * semântica tri-state repassada sem normalização).
 */
@Injectable()
export class UpdateProductUseCase {
  constructor(private readonly productRepository: PrismaProductRepository) {}

  async execute(input: UpdateProductInput): Promise<UpdateProductResult> {
    return this.productRepository.updateBySite(input);
  }
}
