import { Injectable } from '@nestjs/common';
import { ArchiveOfferUseCase } from '../../catalog/application/archive-offer.use-case';
import { UnarchiveOfferUseCase } from '../../catalog/application/unarchive-offer.use-case';
import { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Offer } from '../../../generated/prisma/client';

export interface OfferArchiveAndRevalidateInput {
  siteId: string;
  siteSlug: string;
  productId: string;
  offerId: string;
}

export type OfferArchiveAndRevalidateResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'NOT_FOUND' };

/**
 * Único caminho HTTP que persiste `archivedAt` de `Offer`, nos dois
 * sentidos (REV-013). Nome neutro em relação à direção — cobre tanto
 * `archive()` quanto `unarchive()` — mas os dois caminhos continuam
 * explícitos: `archive()` só chama `ArchiveOfferUseCase` (CAT-019),
 * `unarchive()` só chama `UnarchiveOfferUseCase` (CAT-020). Nenhum
 * despacho genérico entre os dois. Cross-domain (Catalog + a coordenação
 * de revalidação), por isso vive em `application`, não em `CatalogModule`
 * — mesmo critério de `UpdateOfferAndRevalidateUseCase`. Nenhuma
 * abstração compartilhada com `ProductArchiveAndRevalidateUseCase` — cada
 * orquestrador mantém sua própria classe, mesmo padrão de duas rotas por
 * classe, mas código próprio.
 *
 * `ArchiveOfferUseCase`/`UnarchiveOfferUseCase` são idempotentes
 * (`PrismaOfferRepository.archiveBySite`/`unarchiveBySite`): chamar
 * `archive()` numa Oferta já arquivada, ou `unarchive()` numa já ativa,
 * ainda retorna a Oferta (não `null`) — mesmo critério já usado em
 * `ProductArchiveAndRevalidateUseCase`: esse sucesso idempotente é tratado
 * como sucesso normal, sem `409`/`UNCHANGED`, e ainda aciona
 * `revalidateForOffer` normalmente. Só `null` — Oferta não existe, é de
 * outro Site, ou é de outro Produto (a identidade contextual garantida por
 * `PrismaOfferRepository.archiveBySite`/`unarchiveBySite`) — impede a
 * revalidação.
 *
 * Sem `try/catch`/`Logger` própria — mesma razão dos demais orquestradores
 * baseados em `RevalidateAffectedArticlesUseCase`: ela já garante, por
 * contrato, que toda falha (descoberta via APP-005 ou revalidação via
 * REV-002) é capturada e logada internamente, e que `Promise<void>` sempre
 * resolve.
 */
@Injectable()
export class OfferArchiveAndRevalidateUseCase {
  constructor(
    private readonly archiveOfferUseCase: ArchiveOfferUseCase,
    private readonly unarchiveOfferUseCase: UnarchiveOfferUseCase,
    private readonly revalidateAffectedArticlesUseCase: RevalidateAffectedArticlesUseCase,
  ) {}

  async archive(
    input: OfferArchiveAndRevalidateInput,
  ): Promise<OfferArchiveAndRevalidateResult> {
    const offer = await this.archiveOfferUseCase.execute({
      siteId: input.siteId,
      productId: input.productId,
      id: input.offerId,
    });

    if (!offer) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForOffer({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      offerId: input.offerId,
    });

    return { ok: true, offer };
  }

  async unarchive(
    input: OfferArchiveAndRevalidateInput,
  ): Promise<OfferArchiveAndRevalidateResult> {
    const offer = await this.unarchiveOfferUseCase.execute({
      siteId: input.siteId,
      productId: input.productId,
      id: input.offerId,
    });

    if (!offer) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    await this.revalidateAffectedArticlesUseCase.revalidateForOffer({
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      offerId: input.offerId,
    });

    return { ok: true, offer };
  }
}
