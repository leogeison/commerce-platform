import { Injectable } from '@nestjs/common';
import {
  UpdateOfferUseCase,
  type UpdateOfferResult,
} from '../../catalog/application/update-offer.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Marketplace } from '../../../generated/prisma/client';

export interface UpdateOfferAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  productId: string;
  offerId: string;
  marketplace?: Marketplace;
  price?: string;
  currency?: string;
  affiliateUrl?: string;
  inStock?: boolean;
}

/**
 * Único caminho HTTP que persiste alterações de `Offer`: sempre atualiza
 * e, em seguida — só em caso de sucesso —, aciona a coordenação de
 * revalidação para os Artigos publicados afetados. Cross-domain (Catalog +
 * a coordenação de revalidação), por isso vive em `application`, não em
 * `CatalogModule` — mesmo critério de `UpdateProductAndRevalidateUseCase`/
 * `UpdateCategoryAndRevalidateUseCase`.
 *
 * Sem `try/catch`/`Logger` própria — mesma razão dos demais orquestradores
 * baseados em `RevalidateAffectedArticlesUseCase`: ela já garante, por
 * contrato, que toda falha (descoberta via APP-005 ou revalidação via
 * REV-002) é capturada e logada internamente, e que `Promise<void>` sempre
 * resolve. Falha de persistência (`NOT_FOUND` — id/Site/Produto não
 * correspondem simultaneamente) significa que nada mudou — a coordenação
 * de revalidação nunca é acionada nesse caso.
 */
@Injectable()
export class UpdateOfferAndRevalidateUseCase {
  constructor(
    private readonly updateOfferUseCase: UpdateOfferUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async execute(input: UpdateOfferAndRevalidateInput): Promise<UpdateOfferResult> {
    const result = await this.updateOfferUseCase.execute({
      siteId: input.siteId,
      productId: input.productId,
      id: input.offerId,
      marketplace: input.marketplace,
      price: input.price,
      currency: input.currency,
      affiliateUrl: input.affiliateUrl,
      inStock: input.inStock,
    });

    if (!result.ok) {
      return result;
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForOffer({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      offerId: input.offerId,
    });

    return result;
  }
}
