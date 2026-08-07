import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Offer } from '../../../generated/prisma/client';
import type { HandleAffiliateRedirectUseCase } from '../application/handle-affiliate-redirect.use-case';
import { AffiliateRedirectController } from './affiliate-redirect.controller';

const SITE_ID = 'site-1';
const SITE_SLUG = 'loja-a';
const OFFER_ID = 'offer-1';
const ARTICLE_ID = 'article-1';

function buildRequest(headers: Record<string, string> = {}): Request {
  return {
    tenant: { siteId: SITE_ID, siteSlug: SITE_SLUG },
    headers,
  } as unknown as Request;
}

/**
 * `@Res({ passthrough: false })` (TRK-006): o método nunca mais retorna
 * nada interpretável pelo Nest, então o teste passa a inspecionar as
 * chamadas ao `res` fake em vez do valor de retorno.
 */
function buildResponse(): {
  res: Response;
  status: jest.Mock;
  type: jest.Mock;
  send: jest.Mock;
  redirect: jest.Mock;
} {
  const status = jest.fn();
  const type = jest.fn();
  const send = jest.fn();
  const redirect = jest.fn();
  status.mockReturnValue({ type });
  type.mockReturnValue({ send });

  const res = { status, redirect } as unknown as Response;

  return { res, status, type, send, redirect };
}

/**
 * `execute` mockado (nunca a instância real com `PrismaOfferRepository`/
 * `PrismaArticleRepository`) — mesmo padrão de todo teste de controller
 * cross-domain deste projeto (ex.: `remove-product.e2e-spec.ts` usa banco
 * real via `TestingModule`, mas aqui não há `TestingModule` nenhum: o
 * controller ainda não estava registrado em nenhum módulo até TRK-006).
 *
 * Este teste valida só delegação, mapeamento de erro e chamadas ao `res`
 * dentro do método — **não** valida roteamento (`@Controller`/`@Get`),
 * `PublicTenantGuard` nem `ZodValidationPipe`: a chamada a
 * `controller.redirect(...)` é direta, nunca passa pelo pipeline HTTP do
 * Nest. Isso é coberto pela suíte e2e (`apps/api/test/
 * affiliate-redirect.e2e-spec.ts`, nascida na TRK-006).
 */
function buildController(
  result: Awaited<ReturnType<HandleAffiliateRedirectUseCase['execute']>>,
) {
  const execute = jest.fn().mockResolvedValue(result);
  const useCase = { execute } as unknown as HandleAffiliateRedirectUseCase;
  const controller = new AffiliateRedirectController(useCase);

  return { controller, execute };
}

describe('AffiliateRedirectController', () => {
  it('delega com siteId do tenant, offerId dos params e articleId da query', async () => {
    const offer = {
      id: OFFER_ID,
      affiliateUrl: 'https://loja.test.com/produto',
    } as unknown as Offer;
    const { controller, execute } = buildController({
      ok: true,
      offer,
      articleId: ARTICLE_ID,
    });
    const { res } = buildResponse();

    await controller.redirect(
      { siteSlug: SITE_SLUG, offerId: OFFER_ID },
      { articleId: ARTICLE_ID },
      buildRequest(),
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: ARTICLE_ID,
    });
  });

  it('TRK-006: sucesso chama res.redirect(302, affiliateUrl)', async () => {
    const offer = {
      id: OFFER_ID,
      affiliateUrl: 'https://loja.test.com/produto',
    } as unknown as Offer;
    const { controller } = buildController({ ok: true, offer, articleId: null });
    const { res, redirect, status } = buildResponse();

    await controller.redirect({ siteSlug: SITE_SLUG, offerId: OFFER_ID }, {}, buildRequest(), res);

    expect(redirect).toHaveBeenCalledWith(302, offer.affiliateUrl);
    expect(status).not.toHaveBeenCalled();
  });

  it('TRK-006: OFFER_ARCHIVED responde 410 com HTML amigável, sem redirecionar', async () => {
    const { controller } = buildController({ ok: false, reason: 'OFFER_ARCHIVED' });
    const { res, status, type, send, redirect } = buildResponse();

    await controller.redirect({ siteSlug: SITE_SLUG, offerId: OFFER_ID }, {}, buildRequest(), res);

    expect(status).toHaveBeenCalledWith(410);
    expect(type).toHaveBeenCalledWith('html');
    expect(send).toHaveBeenCalledWith(expect.stringContaining('não está mais disponível'));
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sem articleId na query: delega articleId undefined, nunca inventado', async () => {
    const offer = {
      id: OFFER_ID,
      affiliateUrl: 'https://loja.test.com/produto',
    } as unknown as Offer;
    const { controller, execute } = buildController({ ok: true, offer, articleId: null });
    const { res } = buildResponse();

    await controller.redirect({ siteSlug: SITE_SLUG, offerId: OFFER_ID }, {}, buildRequest(), res);

    expect(execute).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: undefined,
    });
  });

  it('TRK-003: encaminha UTM (query) e referer/user-agent (headers) para os nomes internos, sem trocar fontes', async () => {
    const offer = {
      id: OFFER_ID,
      affiliateUrl: 'https://loja.test.com/produto',
    } as unknown as Offer;
    const { controller, execute } = buildController({ ok: true, offer, articleId: null });
    const { res } = buildResponse();

    await controller.redirect(
      { siteSlug: SITE_SLUG, offerId: OFFER_ID },
      { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'black-friday' },
      buildRequest({ referer: 'https://origem.test.com/', 'user-agent': 'UA-Test/1.0' }),
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: undefined,
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'black-friday',
      referer: 'https://origem.test.com/',
      userAgent: 'UA-Test/1.0',
    });
  });

  it('TRK-003: sem UTM na query e sem headers de referer/user-agent, tudo undefined (nunca inventado)', async () => {
    const offer = {
      id: OFFER_ID,
      affiliateUrl: 'https://loja.test.com/produto',
    } as unknown as Offer;
    const { controller, execute } = buildController({ ok: true, offer, articleId: null });
    const { res } = buildResponse();

    await controller.redirect({ siteSlug: SITE_SLUG, offerId: OFFER_ID }, {}, buildRequest(), res);

    expect(execute).toHaveBeenCalledWith({
      siteId: SITE_ID,
      offerId: OFFER_ID,
      articleId: undefined,
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
      referer: undefined,
      userAgent: undefined,
    });
  });

  it('OFFER_NOT_FOUND: lança NotFoundException, sem tocar em res', async () => {
    const { controller } = buildController({ ok: false, reason: 'OFFER_NOT_FOUND' });
    const { res, status, redirect } = buildResponse();

    await expect(
      controller.redirect({ siteSlug: SITE_SLUG, offerId: OFFER_ID }, {}, buildRequest(), res),
    ).rejects.toThrow(NotFoundException);
    expect(status).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('ARTICLE_NOT_FOUND: lança NotFoundException, sem tocar em res', async () => {
    const { controller } = buildController({ ok: false, reason: 'ARTICLE_NOT_FOUND' });
    const { res, status, redirect } = buildResponse();

    await expect(
      controller.redirect(
        { siteSlug: SITE_SLUG, offerId: OFFER_ID },
        { articleId: ARTICLE_ID },
        buildRequest(),
        res,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(status).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
