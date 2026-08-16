import type { Offer } from '../../../generated/prisma/client';
import type { PrismaOfferRepository } from '../infrastructure/prisma-offer.repository';
import { CreateOfferUseCase } from './create-offer.use-case';
import { GetOfferUseCase } from './get-offer.use-case';
import { ListOffersUseCase } from './list-offers.use-case';
import { ArchiveOfferUseCase } from './archive-offer.use-case';
import { UnarchiveOfferUseCase } from './unarchive-offer.use-case';
import { DeleteOfferUseCase } from './delete-offer.use-case';

/**
 * QA-001 — mesmo critério de `category-use-cases.spec.ts`/
 * `product-use-cases.spec.ts`, aplicado aos 6 casos de uso de Oferta
 * (CAT-015/016/017/019/020/021). `productId` é parte da identidade
 * contextual da Oferta (get/archive/unarchive), diferente de Categoria/
 * Produto. `ListOffersUseCase` é o único deste grupo com um branch próprio
 * (`PRODUCT_NOT_FOUND` antes de calcular paginação) — os dois caminhos são
 * testados explicitamente.
 */
const SITE_ID = 'site-1';
const PRODUCT_ID = 'product-1';
const OFFER_ID = 'offer-1';

function buildFakeRepository(methods: Partial<Record<keyof PrismaOfferRepository, jest.Mock>>) {
  return methods as unknown as PrismaOfferRepository;
}

describe('CreateOfferUseCase', () => {
  it('delega ao repository e devolve o resultado tal como recebido (sucesso)', async () => {
    const fakeOffer = { id: OFFER_ID } as unknown as Offer;
    const create = jest.fn().mockResolvedValue({ ok: true, offer: fakeOffer });
    const useCase = new CreateOfferUseCase(buildFakeRepository({ create }));

    const input = {
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      marketplace: 'AMAZON_BR' as const,
      price: '199.90',
      affiliateUrl: 'https://amazon.com.br/x',
    };
    const result = await useCase.execute(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, offer: fakeOffer });
  });

  it('propaga PRODUCT_NOT_FOUND sem alterar o resultado', async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
    const useCase = new CreateOfferUseCase(buildFakeRepository({ create }));

    const result = await useCase.execute({
      siteId: SITE_ID,
      productId: PRODUCT_ID,
      marketplace: 'AMAZON_BR' as const,
      price: '199.90',
      affiliateUrl: 'https://amazon.com.br/x',
    });

    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
  });
});

describe('GetOfferUseCase', () => {
  it('delega a findOneByProductAndSite com siteId, productId e id corretos', async () => {
    const fakeOffer = { id: OFFER_ID } as unknown as Offer;
    const findOneByProductAndSite = jest.fn().mockResolvedValue(fakeOffer);
    const useCase = new GetOfferUseCase(buildFakeRepository({ findOneByProductAndSite }));

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID });

    expect(findOneByProductAndSite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID, OFFER_ID);
    expect(result).toBe(fakeOffer);
  });

  it('devolve null quando não encontra', async () => {
    const findOneByProductAndSite = jest.fn().mockResolvedValue(null);
    const useCase = new GetOfferUseCase(buildFakeRepository({ findOneByProductAndSite }));

    expect(await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID })).toBeNull();
  });
});

describe('ListOffersUseCase', () => {
  it('quando o repository devolve PRODUCT_NOT_FOUND, propaga sem calcular paginação', async () => {
    const findManyByProduct = jest.fn().mockResolvedValue({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
    const useCase = new ListOffersUseCase(buildFakeRepository({ findManyByProduct }));

    const input = { siteId: SITE_ID, productId: PRODUCT_ID, page: 1, pageSize: 10 };
    const result = await useCase.execute(input);

    expect(findManyByProduct).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
  });

  it('quando o Produto existe, calcula totalPages a partir do total devolvido', async () => {
    const items = [{ id: OFFER_ID }] as unknown as Offer[];
    const findManyByProduct = jest.fn().mockResolvedValue({ ok: true, items, total: 21 });
    const useCase = new ListOffersUseCase(buildFakeRepository({ findManyByProduct }));

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, page: 2, pageSize: 10 });

    expect(result).toEqual({ ok: true, items, page: 2, pageSize: 10, total: 21, totalPages: 3 });
  });
});

describe('ArchiveOfferUseCase', () => {
  it('delega a archiveBySite com siteId, productId e id corretos', async () => {
    const fakeOffer = { id: OFFER_ID } as unknown as Offer;
    const archiveBySite = jest.fn().mockResolvedValue(fakeOffer);
    const useCase = new ArchiveOfferUseCase(buildFakeRepository({ archiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID });

    expect(archiveBySite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID, OFFER_ID);
    expect(result).toBe(fakeOffer);
  });

  it('devolve null quando não existe, é de outro Site ou de outro Produto', async () => {
    const archiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new ArchiveOfferUseCase(buildFakeRepository({ archiveBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID })).toBeNull();
  });
});

describe('UnarchiveOfferUseCase', () => {
  it('delega a unarchiveBySite com siteId, productId e id corretos', async () => {
    const fakeOffer = { id: OFFER_ID } as unknown as Offer;
    const unarchiveBySite = jest.fn().mockResolvedValue(fakeOffer);
    const useCase = new UnarchiveOfferUseCase(buildFakeRepository({ unarchiveBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID });

    expect(unarchiveBySite).toHaveBeenCalledWith(SITE_ID, PRODUCT_ID, OFFER_ID);
    expect(result).toBe(fakeOffer);
  });

  it('devolve null quando não existe, é de outro Site ou de outro Produto', async () => {
    const unarchiveBySite = jest.fn().mockResolvedValue(null);
    const useCase = new UnarchiveOfferUseCase(buildFakeRepository({ unarchiveBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, productId: PRODUCT_ID, id: OFFER_ID })).toBeNull();
  });
});

describe('DeleteOfferUseCase', () => {
  it('delega a deleteBySite com siteId e id corretos (sucesso)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: true });
    const useCase = new DeleteOfferUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: OFFER_ID });

    expect(deleteBySite).toHaveBeenCalledWith(SITE_ID, OFFER_ID);
    expect(result).toEqual({ ok: true });
  });

  it('propaga HAS_DEPENDENTS sem conhecer AffiliateClick (isso é responsabilidade de TRK-010)', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'HAS_DEPENDENTS' });
    const useCase = new DeleteOfferUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: OFFER_ID });

    expect(result).toEqual({ ok: false, reason: 'HAS_DEPENDENTS' });
  });

  it('propaga NOT_FOUND sem alterar o resultado', async () => {
    const deleteBySite = jest.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const useCase = new DeleteOfferUseCase(buildFakeRepository({ deleteBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: OFFER_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
