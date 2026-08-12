import type { Offer } from '../../../generated/prisma/client';
import type { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import { UpdateOfferUseCase } from './update-offer.use-case';

const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';
const OFFER_ID = 'offer-1';

function buildFakeRepository(result: unknown) {
  const updateBySite = jest.fn().mockResolvedValue(result);
  const repository = { updateBySite } as unknown as PrismaOfferRepository;

  return { repository, updateBySite };
}

describe('UpdateOfferUseCase', () => {
  it('delega ao repository com siteId, productId, id e todos os campos, e devolve o resultado tal como recebido', async () => {
    const fakeOffer = { id: OFFER_ID, marketplace: 'AMAZON_BR' } as unknown as Offer;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, offer: fakeOffer });
    const useCase = new UpdateOfferUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      id: OFFER_ID,
      marketplace: 'AMAZON_BR',
      price: '199.90',
      currency: 'USD',
      affiliateUrl: 'https://example.com/aff',
      inStock: false,
    });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      id: OFFER_ID,
      marketplace: 'AMAZON_BR',
      price: '199.90',
      currency: 'USD',
      affiliateUrl: 'https://example.com/aff',
      inStock: false,
    });
    expect(result).toEqual({ ok: true, offer: fakeOffer });
  });

  it('repassa campos omitidos como undefined (PATCH parcial)', async () => {
    const fakeOffer = { id: OFFER_ID } as unknown as Offer;
    const { repository, updateBySite } = buildFakeRepository({ ok: true, offer: fakeOffer });
    const useCase = new UpdateOfferUseCase(repository);

    await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID });

    expect(updateBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      id: OFFER_ID,
      marketplace: undefined,
      price: undefined,
      currency: undefined,
      affiliateUrl: undefined,
      inStock: undefined,
    });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const { repository } = buildFakeRepository({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new UpdateOfferUseCase(repository);

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      id: OFFER_ID,
      inStock: false,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
