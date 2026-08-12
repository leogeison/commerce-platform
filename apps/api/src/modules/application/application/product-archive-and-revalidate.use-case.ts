import { Injectable } from '@nestjs/common';
import { ArchiveProductUseCase } from '../../catalog/application/archive-product.use-case';
import { UnarchiveProductUseCase } from '../../catalog/application/unarchive-product.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Product } from '../../../generated/prisma/client';

export interface ProductArchiveAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  productId: string;
}

export type ProductArchiveAndRevalidateResult =
  | { ok: true; product: Product }
  | { ok: false; reason: 'NOT_FOUND' };

/**
 * Único caminho HTTP que persiste `archivedAt` de `Product`, nos dois
 * sentidos (REV-011). Nome neutro em relação à direção — cobre tanto
 * `archive()` quanto `unarchive()` — mas os dois caminhos continuam
 * explícitos: `archive()` só chama `ArchiveProductUseCase` (CAT-012),
 * `unarchive()` só chama `UnarchiveProductUseCase` (CAT-013). Nenhum
 * despacho genérico entre os dois. Cross-domain (Catalog + a coordenação
 * de revalidação), por isso vive em `application`, não em `CatalogModule`
 * — mesmo critério de `UpdateProductAndRevalidateUseCase`.
 *
 * `ArchiveProductUseCase`/`UnarchiveProductUseCase` são idempotentes
 * (`PrismaProductRepository.archiveBySite`/`unarchiveBySite`): chamar
 * `archive()` num Produto já arquivado, ou `unarchive()` num Produto já
 * ativo, ainda retorna o Produto (não `null`) — decisão explícita: esse
 * sucesso idempotente é tratado como sucesso normal, sem `409`/`UNCHANGED`,
 * e ainda aciona `revalidateForProduct` normalmente. Só `null` (Produto não
 * existe ou é de outro Site) impede a revalidação.
 *
 * Sem `try/catch`/`Logger` própria — mesma razão de
 * `UpdateProductAndRevalidateUseCase`: `RevalidateAffectedArticlesUseCase`
 * já garante, por contrato, que toda falha (descoberta via APP-005 ou
 * revalidação via REV-002) é capturada e logada internamente, e que
 * `Promise<void>` sempre resolve.
 */
@Injectable()
export class ProductArchiveAndRevalidateUseCase {
  constructor(
    private readonly archiveProductUseCase: ArchiveProductUseCase,
    private readonly unarchiveProductUseCase: UnarchiveProductUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async archive(
    input: ProductArchiveAndRevalidateInput,
  ): Promise<ProductArchiveAndRevalidateResult> {
    const product = await this.archiveProductUseCase.execute({
      siteId: input.siteId,
      id: input.productId,
    });

    if (!product) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForProduct({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      productId: input.productId,
    });

    return { ok: true, product };
  }

  async unarchive(
    input: ProductArchiveAndRevalidateInput,
  ): Promise<ProductArchiveAndRevalidateResult> {
    const product = await this.unarchiveProductUseCase.execute({
      siteId: input.siteId,
      id: input.productId,
    });

    if (!product) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForProduct({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      productId: input.productId,
    });

    return { ok: true, product };
  }
}
