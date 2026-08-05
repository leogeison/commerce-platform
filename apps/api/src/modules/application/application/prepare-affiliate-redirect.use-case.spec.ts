import type { Article, Offer } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import type { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import { PrepareAffiliateRedirectUseCase } from './prepare-affiliate-redirect.use-case';

const SITE_ID = 'site-1';
const OFFER_ID = 'offer-1';
const ARTICLE_ID = 'article-1';

function buildOffer(archived: boolean): Offer {
  return {
    id: OFFER_ID,
    siteId: SITE_ID,
    archivedAt: archived ? new Date() : null,
  } as unknown as Offer;
}

function buildArticle(): Article {
  return { id: ARTICLE_ID, siteId: SITE_ID } as unknown as Article;
}

function buildFakes(fixtures: { offer: Offer | null; article?: Article | null }) {
  const findOfferBySite = jest.fn().mockResolvedValue(fixtures.offer);
  const findArticleBySite = jest.fn().mockResolvedValue(fixtures.article ?? null);

  const offerRepository = { findOneBySite: findOfferBySite } as unknown as PrismaOfferRepository;
  const articleRepository = {
    findOneBySite: findArticleBySite,
  } as unknown as PrismaArticleRepository;

  const useCase = new PrepareAffiliateRedirectUseCase(offerRepository, articleRepository);

  return { useCase, findOfferBySite, findArticleBySite };
}

describe('PrepareAffiliateRedirectUseCase', () => {
  it('sucesso sem articleId: devolve a Oferta e articleId: null', async () => {
    const offer = buildOffer(false);
    const { useCase, findOfferBySite, findArticleBySite } = buildFakes({ offer });

    const result = await useCase.execute({ siteId: SITE_ID, offerId: OFFER_ID });

    expect(result).toEqual({ ok: true, offer, articleId: null });
    expect(findOfferBySite).toHaveBeenCalledWith(SITE_ID, OFFER_ID);
    expect(findArticleBySite).not.toHaveBeenCalled();
  });

  it('sucesso com articleId válido: devolve a Oferta e o articleId validado', async () => {
    const offer = buildOffer(false);
    const article = buildArticle();
    const { useCase, findArticleBySite } = buildFakes({ offer, article });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: true, offer, articleId: ARTICLE_ID });
    expect(findArticleBySite).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
  });

  it('OFFER_NOT_FOUND: nunca consulta o Artigo', async () => {
    const { useCase, findArticleBySite } = buildFakes({ offer: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'OFFER_NOT_FOUND' });
    expect(findArticleBySite).not.toHaveBeenCalled();
  });

  it('ARTICLE_NOT_FOUND: Artigo inexistente ou de outro Site (mesma busca tenant-aware)', async () => {
    const offer = buildOffer(false);
    const { useCase } = buildFakes({ offer, article: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'ARTICLE_NOT_FOUND' });
  });

  it('OFFER_ARCHIVED sem articleId', async () => {
    const offer = buildOffer(true);
    const { useCase } = buildFakes({ offer });

    const result = await useCase.execute({ siteId: SITE_ID, offerId: OFFER_ID });

    expect(result).toEqual({ ok: false, reason: 'OFFER_ARCHIVED' });
  });

  it('OFFER_ARCHIVED com articleId válido', async () => {
    const offer = buildOffer(true);
    const article = buildArticle();
    const { useCase } = buildFakes({ offer, article });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'OFFER_ARCHIVED' });
  });

  it('articleId inválido + Oferta arquivada: ARTICLE_NOT_FOUND prevalece (ordem fixa)', async () => {
    const offer = buildOffer(true);
    const { useCase } = buildFakes({ offer, article: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'ARTICLE_NOT_FOUND' });
  });
});
