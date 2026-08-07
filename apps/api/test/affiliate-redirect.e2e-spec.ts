import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Marketplace } from '../src/generated/prisma/enums';
import type { AffiliateClick, Article, Offer, Product, Site } from '../src/generated/prisma/client';

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `GET /r/:siteSlug/:offerId` (e2e, TRK-006 — última tarefa da sequência
 * `TRK-002` a `TRK-006`, primeira a registrar a rota de verdade). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto).
 *
 * Rota pública: sem `SessionAuthGuard`/cookie, sem `OriginGuard` — mesmo
 * critério já documentado em `HttpModule` desde a `INF-006`.
 */
describe('GET /r/:siteSlug/:offerId (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'trk006-site-a',
        name: 'TRK-006 Site A',
        domain: 'trk006-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'trk006-site-b',
        name: 'TRK-006 Site B',
        domain: 'trk006-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto TRK-006', slug: 'produto-trk006' },
    });
  });

  afterEach(async () => {
    await prisma.affiliateClick.deleteMany({
      where: { site: { slug: { startsWith: 'trk006-' } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'trk006-' } } } });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'trk006-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'trk006-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'trk006-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createOffer(
    site: Site,
    product: Product,
    options: { archived?: boolean } = {},
  ): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/produto-trk006',
        archivedAt: options.archived ? new Date() : null,
      },
    });
  }

  async function createArticle(site: Site, slug: string): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
      },
    });
  }

  function findClicksByOffer(offerId: string): Promise<AffiliateClick[]> {
    return prisma.affiliateClick.findMany({ where: { offerId } });
  }

  function redirectRequest(
    siteSlug: string,
    offerId: string,
    query: Record<string, string> = {},
    headers: Record<string, string> = {},
  ) {
    let req = request(app!.getHttpServer())
      .get(`/r/${siteSlug}/${offerId}`)
      .query(query)
      .redirects(0);

    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }

    return req;
  }

  it('302 sem articleId: Location correto e clique persistido, sem articleId/UTM/referer/userAgent', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await redirectRequest(siteA.slug, offer.id);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(offer.affiliateUrl);

    const clicks = await findClicksByOffer(offer.id);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      siteId: siteA.id,
      offerId: offer.id,
      articleId: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referer: null,
      userAgent: null,
    });
  });

  it('302 com articleId válido: Location correto e clique associado ao Artigo', async () => {
    const offer = await createOffer(siteA, productA);
    const article = await createArticle(siteA, 'artigo-trk006');

    const response = await redirectRequest(siteA.slug, offer.id, { articleId: article.id });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(offer.affiliateUrl);

    const clicks = await findClicksByOffer(offer.id);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].articleId).toBe(article.id);
  });

  it('410 para Oferta arquivada: corpo HTML amigável, Content-Type correto, clique ainda assim persistido', async () => {
    const archivedOffer = await createOffer(siteA, productA, { archived: true });

    const response = await redirectRequest(siteA.slug, archivedOffer.id);

    expect(response.status).toBe(410);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('não está mais disponível');

    const clicks = await findClicksByOffer(archivedOffer.id);
    expect(clicks).toHaveLength(1);
  });

  it('UTM da query + referer/user-agent dos headers persistidos corretamente no clique', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await redirectRequest(
      siteA.slug,
      offer.id,
      { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'black-friday' },
      { Referer: 'https://origem.test.com/', 'User-Agent': 'UA-Test/1.0' },
    );

    expect(response.status).toBe(302);

    const clicks = await findClicksByOffer(offer.id);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'black-friday',
      referer: 'https://origem.test.com/',
      userAgent: 'UA-Test/1.0',
    });
  });

  it('siteSlug inexistente: 404, nenhum clique registrado', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await redirectRequest('trk006-site-inexistente', offer.id);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(await findClicksByOffer(offer.id)).toHaveLength(0);
  });

  it('Oferta inexistente no Site: 404, nenhum clique registrado', async () => {
    const response = await redirectRequest(siteA.slug, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(await findClicksByOffer(NONEXISTENT_ID)).toHaveLength(0);
  });

  it('Oferta de outro Site, acessada pelo siteSlug do Site correto: 404, nenhum clique registrado (isolamento básico)', async () => {
    const productB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Produto TRK-006 B', slug: 'produto-trk006-b' },
    });
    const offerFromSiteB = await createOffer(siteB, productB);

    const response = await redirectRequest(siteA.slug, offerFromSiteB.id);

    expect(response.status).toBe(404);
    expect(await findClicksByOffer(offerFromSiteB.id)).toHaveLength(0);
  });

  it('Artigo inexistente: 404, nenhum clique registrado', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await redirectRequest(siteA.slug, offer.id, { articleId: NONEXISTENT_ID });

    expect(response.status).toBe(404);
    expect(await findClicksByOffer(offer.id)).toHaveLength(0);
  });

  it('Artigo de outro Site: 404, nenhum clique registrado', async () => {
    const offer = await createOffer(siteA, productA);
    const articleFromSiteB = await createArticle(siteB, 'artigo-trk006-b');

    const response = await redirectRequest(siteA.slug, offer.id, {
      articleId: articleFromSiteB.id,
    });

    expect(response.status).toBe(404);
    expect(await findClicksByOffer(offer.id)).toHaveLength(0);
  });

  it('offerId com formato inválido (não-UUID): 422, nenhum clique registrado', async () => {
    const response = await redirectRequest(siteA.slug, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
    expect(await prisma.affiliateClick.count({ where: { siteId: siteA.id } })).toBe(0);
  });

  it('articleId com formato inválido na query (não-UUID): 422, nenhum clique registrado', async () => {
    const offer = await createOffer(siteA, productA);

    const response = await redirectRequest(siteA.slug, offer.id, { articleId: 'nao-e-um-uuid' });

    expect(response.status).toBe(422);
    expect(await findClicksByOffer(offer.id)).toHaveLength(0);
  });

  /**
   * TRK-007: `RateLimitGuard` (`{ limit: 30, windowMs: 60_000 }`) roda
   * antes de `PublicTenantGuard` no `@UseGuards`. `siteSlug` inexistente
   * (com `offerId` em formato UUID válido, para nunca disparar o `422` de
   * `TRK-001` antes do guard de rate limit) prova as duas coisas ao mesmo
   * tempo: as primeiras 30 requisições passam pelo rate limit e chegam ao
   * `PublicTenantGuard` (que rejeita com `404`, Site inexistente); a 31ª já
   * nem chega lá — `429` do próprio `RateLimitGuard`, antes de qualquer
   * consulta ao Site.
   */
  it('TRK-007: 31ª requisição no mesmo IP responde 429 antes de resolver o Site, sem clique', async () => {
    const nonexistentSiteSlug = 'trk007-site-inexistente';

    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const response = await redirectRequest(nonexistentSiteSlug, NONEXISTENT_ID);
      expect(response.status).toBe(404);
    }

    const blockedResponse = await redirectRequest(nonexistentSiteSlug, NONEXISTENT_ID);

    expect(blockedResponse.status).toBe(429);
    expect(await findClicksByOffer(NONEXISTENT_ID)).toHaveLength(0);
  });
});
