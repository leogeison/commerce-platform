import { OfferArchiveAndRevalidateUseCase } from './offer-archive-and-revalidate.use-case';
import type { ArchiveOfferUseCase } from '../../catalog/application/archive-offer.use-case';
import type { UnarchiveOfferUseCase } from '../../catalog/application/unarchive-offer.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Offer } from '../../../generated/prisma/client';

describe('OfferArchiveAndRevalidateUseCase', () => {
  function build(options: { archiveResult: Offer | null; unarchiveResult: Offer | null }) {
    const archiveOfferUseCase = {
      execute: jest.fn().mockResolvedValue(options.archiveResult),
    } as unknown as jest.Mocked<ArchiveOfferUseCase>;

    const unarchiveOfferUseCase = {
      execute: jest.fn().mockResolvedValue(options.unarchiveResult),
    } as unknown as jest.Mocked<UnarchiveOfferUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForOffer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new OfferArchiveAndRevalidateUseCase(
      archiveOfferUseCase,
      unarchiveOfferUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, archiveOfferUseCase, unarchiveOfferUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    productId: 'product-1',
    offerId: 'offer-1',
  };

  describe('archive', () => {
    it('oferta não encontrada (id, Site ou Produto não correspondem): não chama REV-005, devolve NOT_FOUND', async () => {
      const { useCase, archiveOfferUseCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(archiveOfferUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        productId: 'product-1',
        id: 'offer-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).not.toHaveBeenCalled();
    });

    it('arquivamento bem-sucedido: aciona REV-005 com siteId/siteSlug/offerId corretos e devolve a Oferta', async () => {
      const offer = { id: 'offer-1', archivedAt: new Date() } as Offer;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: offer,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, offer });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledTimes(1);
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        offerId: 'offer-1',
      });
    });

    it('sucesso idempotente (Oferta já arquivada, CAT-019 devolve a Oferta mesmo assim): ainda aciona REV-005', async () => {
      const alreadyArchivedOffer = { id: 'offer-1', archivedAt: new Date('2026-01-01') } as Offer;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: alreadyArchivedOffer,
        unarchiveResult: null,
      });

      const result = await useCase.archive(input);

      expect(result).toEqual({ ok: true, offer: alreadyArchivedOffer });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledTimes(1);
    });
  });

  describe('unarchive', () => {
    it('oferta não encontrada (id, Site ou Produto não correspondem): não chama REV-005, devolve NOT_FOUND', async () => {
      const { useCase, unarchiveOfferUseCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: null,
      });

      const result = await useCase.unarchive(input);

      expect(unarchiveOfferUseCase.execute).toHaveBeenCalledWith({
        siteId: 'site-1',
        productId: 'product-1',
        id: 'offer-1',
      });
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).not.toHaveBeenCalled();
    });

    it('desarquivamento bem-sucedido: aciona REV-005 com siteId/siteSlug/offerId corretos e devolve a Oferta', async () => {
      const offer = { id: 'offer-1', archivedAt: null } as Offer;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: offer,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, offer });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledTimes(1);
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledWith({
        siteId: 'site-1',
        siteSlug: 'fastcompre',
        offerId: 'offer-1',
      });
    });

    it('sucesso idempotente (Oferta já ativa, CAT-020 devolve a Oferta mesmo assim): ainda aciona REV-005', async () => {
      const alreadyActiveOffer = { id: 'offer-1', archivedAt: null } as Offer;
      const { useCase, revalidateAffectedArticlesUseCase } = build({
        archiveResult: null,
        unarchiveResult: alreadyActiveOffer,
      });

      const result = await useCase.unarchive(input);

      expect(result).toEqual({ ok: true, offer: alreadyActiveOffer });
      expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledTimes(1);
    });
  });
});
