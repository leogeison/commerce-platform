import { Inject, Injectable } from '@nestjs/common';
import { DeleteOfferUseCase } from '../../catalog/application/delete-offer.use-case';
import { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import {
  AFFILIATE_CLICK_EXISTENCE_CHECKER,
  type AffiliateClickExistenceChecker,
} from '../../tracking/domain/affiliate-click-existence-checker';

export interface RemoveOfferInput {
  siteId: string;
  productId: string;
  offerId: string;
}

export type RemoveOfferResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_CLICKS' };

/**
 * Exclusão física de Oferta (TRK-010) — caso de uso cross-domain completo,
 * com endpoint HTTP real (`RemoveOfferController`, mesmo módulo). Mesmos
 * moldes gerais de `RemoveProductUseCase`/`RemoveCategoryUseCase`, mas mais
 * simples num ponto: `Offer` só tem **uma** FK externa possível
 * (`AffiliateClick.offer`, já documentado em
 * `PrismaOfferRepository.deleteBySite`), então não há ambiguidade de causa
 * a resolver depois de um `P2003` — diferente de Produto/Categoria (que
 * podiam ter `HAS_OFFERS`/`HAS_PRODUCTS` vindo de uma constraint interna do
 * próprio Catalog, exigindo reconsulta para distinguir do vínculo com
 * Artigo), aqui `HAS_DEPENDENTS` só pode significar `AffiliateClick`.
 *
 * 1. Localiza a Oferta por `siteId` + `productId` + `id`
 * (`PrismaOfferRepository.findOneByProductAndSite`, CAT-017) — **não** só
 * `siteId` + `id`: a rota é aninhada em Produto
 * (`/products/:productId/offers/:id`), então o recurso só é considerado
 * "encontrado" se `productId` da URL também bater, mesmo critério já usado
 * no `GET` equivalente (`OffersController.detail`). Isso não é uma regra de
 * negócio nova — só garante que o recurso pertence ao endereço HTTP usado.
 * `null` → `NOT_FOUND`.
 *
 * 2. Verifica `AffiliateClickExistenceChecker.existsForOffer(siteId,
 * offer.id)` (Tracking, TRK-010) — `true` → `HAS_CLICKS`, **sem** chamar
 * `DeleteOfferUseCase`. Usa `offer.id` (canônico, da consulta acima), não
 * `input.offerId` diretamente — mesmo critério de IDs canônicos já usado em
 * `HandleAffiliateRedirectUseCase` (TRK-004).
 *
 * 3. Sem clique: chama `DeleteOfferUseCase.execute` (CAT-021, interno do
 * Catalog). Se devolver `HAS_DEPENDENTS`, mapeia direto para `HAS_CLICKS` —
 * defesa para a janela de corrida entre o passo 2 e a exclusão em si (um
 * clique real pode ter sido registrado nesse intervalo, via
 * `HandleAffiliateRedirectUseCase`); como só existe uma FK externa possível
 * para `Offer`, não há necessidade de reconsulta para confirmar a causa
 * (diferente de `RemoveProductUseCase`/`RemoveCategoryUseCase`) — nenhum
 * lock/transação cross-domain introduzido.
 *
 * Fora do escopo: arquivamento (`REV-013`, Fase 14, sem relação com
 * clique).
 */
@Injectable()
export class RemoveOfferUseCase {
  constructor(
    private readonly offerRepository: PrismaOfferRepository,
    @Inject(AFFILIATE_CLICK_EXISTENCE_CHECKER)
    private readonly affiliateClickExistenceChecker: AffiliateClickExistenceChecker,
    private readonly deleteOfferUseCase: DeleteOfferUseCase,
  ) {}

  async execute(input: RemoveOfferInput): Promise<RemoveOfferResult> {
    const offer = await this.offerRepository.findOneByProductAndSite(
      input.siteId,
      input.productId,
      input.offerId,
    );

    if (!offer) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const hasClicks = await this.affiliateClickExistenceChecker.existsForOffer(
      input.siteId,
      offer.id,
    );

    if (hasClicks) {
      return { ok: false, reason: 'HAS_CLICKS' };
    }

    const result = await this.deleteOfferUseCase.execute({
      siteId: input.siteId,
      id: offer.id,
    });

    if (!result.ok) {
      if (result.reason === 'HAS_DEPENDENTS') {
        return { ok: false, reason: 'HAS_CLICKS' };
      }

      return { ok: false, reason: result.reason };
    }

    return { ok: true };
  }
}
