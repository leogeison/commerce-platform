import type { Article, Offer } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import type { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import type { AffiliateClickRecorder } from '../../tracking/domain/affiliate-click-recorder';
import { HandleAffiliateRedirectUseCase } from './handle-affiliate-redirect.use-case';

const SITE_ID = 'site-1';
const OFFER_ID = 'offer-1';
const ARTICLE_ID = 'article-1';

function buildOffer(archived: boolean, id: string = OFFER_ID): Offer {
  return {
    id,
    siteId: SITE_ID,
    archivedAt: archived ? new Date() : null,
  } as unknown as Offer;
}

function buildArticle(id: string = ARTICLE_ID): Article {
  return { id, siteId: SITE_ID } as unknown as Article;
}

function buildFakes(fixtures: { offer: Offer | null; article?: Article | null }) {
  const findOfferBySite = jest.fn().mockResolvedValue(fixtures.offer);
  const findArticleBySite = jest.fn().mockResolvedValue(fixtures.article ?? null);
  const record = jest.fn().mockResolvedValue(undefined);

  const offerRepository = { findOneBySite: findOfferBySite } as unknown as PrismaOfferRepository;
  const articleRepository = {
    findOneBySite: findArticleBySite,
  } as unknown as PrismaArticleRepository;
  const affiliateClickRecorder = { record } as unknown as AffiliateClickRecorder;

  const useCase = new HandleAffiliateRedirectUseCase(
    offerRepository,
    articleRepository,
    affiliateClickRecorder,
  );

  return { useCase, findOfferBySite, findArticleBySite, record };
}

describe('HandleAffiliateRedirectUseCase', () => {
  it('sucesso sem articleId: devolve a Oferta, articleId: null, e registra o clique', async () => {
    const offer = buildOffer(false);
    const { useCase, findOfferBySite, findArticleBySite, record } = buildFakes({ offer });

    const result = await useCase.execute({ siteId: SITE_ID, offerId: OFFER_ID });

    expect(result).toEqual({ ok: true, offer, articleId: null });
    expect(findOfferBySite).toHaveBeenCalledWith(SITE_ID, OFFER_ID);
    expect(findArticleBySite).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referer: null,
      userAgent: null,
    });
  });

  it('sucesso com articleId válido: devolve a Oferta, o articleId validado, e registra o clique com o articleId', async () => {
    const offer = buildOffer(false);
    const article = buildArticle();
    const { useCase, findArticleBySite, record } = buildFakes({ offer, article });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: true, offer, articleId: ARTICLE_ID });
    expect(findArticleBySite).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: SITE_ID, offerId: OFFER_ID, articleId: ARTICLE_ID }),
    );
  });

  it('registra o clique e devolve o resultado com os IDs canônicos de offer/article carregados, não os brutos da entrada', async () => {
    const offer = buildOffer(false, 'canonical-offer-id');
    const article = buildArticle('canonical-article-id');
    const { useCase, record } = buildFakes({ offer, article });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: 'requested-offer-id',
      articleId: 'requested-article-id',
    });

    expect(result).toEqual({ ok: true, offer, articleId: 'canonical-article-id' });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: 'canonical-offer-id',
        articleId: 'canonical-article-id',
      }),
    );
  });

  it('sucesso com telemetria: encaminha utm*/referer/userAgent normalizados para o registro do clique', async () => {
    const offer = buildOffer(false);
    const { useCase, record } = buildFakes({ offer });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'black-friday',
      referer: 'https://origem.test.com/',
      userAgent: 'Mozilla/5.0',
    });

    expect(result).toEqual({ ok: true, offer, articleId: null });
    expect(record).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: null,
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'black-friday',
      referer: 'https://origem.test.com/',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('OFFER_NOT_FOUND: nunca consulta o Artigo nem registra clique', async () => {
    const { useCase, findArticleBySite, record } = buildFakes({ offer: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'OFFER_NOT_FOUND' });
    expect(findArticleBySite).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('ARTICLE_NOT_FOUND: Artigo inexistente ou de outro Site (mesma busca tenant-aware), sem registrar clique', async () => {
    const offer = buildOffer(false);
    const { useCase, record } = buildFakes({ offer, article: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'ARTICLE_NOT_FOUND' });
    expect(record).not.toHaveBeenCalled();
  });

  it('OFFER_ARCHIVED sem articleId: registra o clique mesmo assim, antes de devolver OFFER_ARCHIVED', async () => {
    const offer = buildOffer(true);
    const { useCase, record } = buildFakes({ offer });

    const result = await useCase.execute({ siteId: SITE_ID, offerId: OFFER_ID });

    expect(result).toEqual({ ok: false, reason: 'OFFER_ARCHIVED' });
    expect(record).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referer: null,
      userAgent: null,
    });
  });

  it('OFFER_ARCHIVED com articleId válido: registra o clique com o articleId, antes de devolver OFFER_ARCHIVED', async () => {
    const offer = buildOffer(true);
    const article = buildArticle();
    const { useCase, record } = buildFakes({ offer, article });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'OFFER_ARCHIVED' });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: SITE_ID, offerId: OFFER_ID, articleId: ARTICLE_ID }),
    );
  });

  it('articleId inválido + Oferta arquivada: ARTICLE_NOT_FOUND prevalece (ordem fixa), sem registrar clique', async () => {
    const offer = buildOffer(true);
    const { useCase, record } = buildFakes({ offer, article: null });

    const result = await useCase.execute({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'ARTICLE_NOT_FOUND' });
    expect(record).not.toHaveBeenCalled();
  });
});
