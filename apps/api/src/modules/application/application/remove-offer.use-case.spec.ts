import type { DeleteOfferUseCase } from '../../catalog/application/delete-offer.use-case';
import type { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import type { AffiliateClickExistenceChecker } from '../../tracking/domain/affiliate-click-existence-checker';
import type { Offer } from '../../../generated/prisma/client';
import { RemoveOfferUseCase } from './remove-offer.use-case';

const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';
const OFFER_ID = 'offer-1';
const CANONICAL_OFFER_ID = 'offer-canonical-1';

function buildFakes(fixtures: {
  offer: Offer | null;
  hasClicks?: boolean;
  deleteResult?: unknown;
}) {
  const findOneByProductAndSite = jest.fn().mockResolvedValue(fixtures.offer);
  const existsForOffer = jest.fn().mockResolvedValue(fixtures.hasClicks ?? false);
  const deleteExecute = jest.fn().mockResolvedValue(fixtures.deleteResult ?? { ok: true });

  const offerRepository = { findOneByProductAndSite } as unknown as PrismaOfferRepository;
  const affiliateClickExistenceChecker = {
    existsForOffer,
  } as unknown as AffiliateClickExistenceChecker;
  const deleteOfferUseCase = { execute: deleteExecute } as unknown as DeleteOfferUseCase;

  const useCase = new RemoveOfferUseCase(
    offerRepository,
    affiliateClickExistenceChecker,
    deleteOfferUseCase,
  );

  return { useCase, findOneByProductAndSite, existsForOffer, deleteExecute };
}

describe('RemoveOfferUseCase', () => {
  it('Oferta não encontrada por siteId+productId+id: NOT_FOUND, nunca consulta clique nem chama CAT-021', async () => {
    const { useCase, existsForOffer, deleteExecute } = buildFakes({ offer: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(existsForOffer).not.toHaveBeenCalled();
    expect(deleteExecute).not.toHaveBeenCalled();
  });

  it('Oferta com clique existente: HAS_CLICKS, CAT-021 nunca é chamado', async () => {
    const offer = { id: CANONICAL_OFFER_ID } as unknown as Offer;
    const { useCase, existsForOffer, deleteExecute } = buildFakes({ offer, hasClicks: true });

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'HAS_CLICKS' });
    expect(existsForOffer).toHaveBeenCalledWith(SITE_ID, CANONICAL_OFFER_ID);
    expect(deleteExecute).not.toHaveBeenCalled();
  });

  it('sem clique: sucesso, delega a CAT-021 com o id canônico da Oferta carregada', async () => {
    const offer = { id: CANONICAL_OFFER_ID } as unknown as Offer;
    const { useCase, deleteExecute } = buildFakes({
      offer,
      hasClicks: false,
      deleteResult: { ok: true },
    });

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(deleteExecute).toHaveBeenCalledWith({ siteId: SITE_ID, id: CANONICAL_OFFER_ID });
  });

  it('sem clique, CAT-021 devolve NOT_FOUND (corrida extrema): propaga sem reinterpretar', async () => {
    const offer = { id: CANONICAL_OFFER_ID } as unknown as Offer;
    const { useCase } = buildFakes({
      offer,
      hasClicks: false,
      deleteResult: { ok: false, reason: 'NOT_FOUND' },
    });

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('corrida: existsForOffer=false mas CAT-021 devolve HAS_DEPENDENTS (clique registrado entre a checagem e o DELETE): mapeia para HAS_CLICKS', async () => {
    const offer = { id: CANONICAL_OFFER_ID } as unknown as Offer;
    const { useCase, existsForOffer, deleteExecute } = buildFakes({
      offer,
      hasClicks: false,
      deleteResult: { ok: false, reason: 'HAS_DEPENDENTS' },
    });

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'HAS_CLICKS' });
    expect(existsForOffer).toHaveBeenCalledTimes(1);
    expect(deleteExecute).toHaveBeenCalledTimes(1);
  });
});
