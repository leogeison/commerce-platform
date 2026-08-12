import { UpdateOfferAndRevalidateUseCase } from './update-offer-and-revalidate.use-case';
import type {
  UpdateOfferUseCase,
  UpdateOfferResult,
} from '../../catalog/application/update-offer.use-case';
import type { RevalidateAffectedArticlesUseCase } from './revalidate-affected-articles.use-case';
import type { Offer } from '../../../generated/prisma/client';

describe('UpdateOfferAndRevalidateUseCase', () => {
  function build(updateResult: UpdateOfferResult) {
    const updateOfferUseCase = {
      execute: jest.fn().mockResolvedValue(updateResult),
    } as unknown as jest.Mocked<UpdateOfferUseCase>;

    const revalidateAffectedArticlesUseCase = {
      revalidateForOffer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevalidateAffectedArticlesUseCase>;

    const useCase = new UpdateOfferAndRevalidateUseCase(
      updateOfferUseCase,
      revalidateAffectedArticlesUseCase,
    );

    return { useCase, updateOfferUseCase, revalidateAffectedArticlesUseCase };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    productId: 'product-1',
    offerId: 'offer-1',
    marketplace: 'AMAZON_BR' as const,
    price: '199.90',
    currency: 'USD',
    affiliateUrl: 'https://example.com/aff',
    inStock: false,
  };

  it('oferta não encontrada: não chama REV-005, devolve o resultado como veio', async () => {
    const { useCase, updateOfferUseCase, revalidateAffectedArticlesUseCase } = build({
      ok: false,
      reason: 'NOT_FOUND',
    });

    const result = await useCase.execute(input);

    expect(updateOfferUseCase.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      productId: 'product-1',
      id: 'offer-1',
      marketplace: 'AMAZON_BR',
      price: '199.90',
      currency: 'USD',
      affiliateUrl: 'https://example.com/aff',
      inStock: false,
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(revalidateAffectedArticlesUseCase.revalidateForOffer).not.toHaveBeenCalled();
  });

  it('atualização bem-sucedida: aciona REV-005 com siteId/siteSlug/offerId corretos e devolve a Oferta atualizada', async () => {
    const offer = { id: 'offer-1', marketplace: 'AMAZON_BR' } as Offer;
    const { useCase, revalidateAffectedArticlesUseCase } = build({ ok: true, offer });

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true, offer });
    expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledTimes(1);
    expect(revalidateAffectedArticlesUseCase.revalidateForOffer).toHaveBeenCalledWith({
      siteId: 'site-1',
      siteSlug: 'fastcompre',
      offerId: 'offer-1',
    });
  });
});
