import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApplicationModule } from '../src/modules/application/application.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Marketplace } from '../src/generated/prisma/enums';
import type { Article, Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * TRK-008 — suíte dedicada de bloqueio de acesso cruzado no redirect de
 * Tracking, no mesmo espírito de `catalog-site-isolation.e2e-spec.ts`
 * (CAT-022) e `site-isolation.e2e-spec.ts` (AUTH-010). Exige Postgres real
 * (mesmo requisito dos demais e2e do projeto).
 *
 * Diferente das demais suítes dedicadas: `GET /r/:siteSlug/:offerId` é
 * pública, sem sessão nem `SiteAuthorizationGuard` — não existe o "vetor 1"
 * de outras suítes (`siteSlug` de outro Site + atacante sem membership →
 * `403`), porque não há conceito de membership aqui. O único vetor possível
 * é o "vetor 2": `siteSlug` correto na URL, mas `offerId`/`articleId`
 * apontando para um recurso de outro Site.
 *
 * Estes dois casos já são cobertos, de forma mais simples, em
 * `affiliate-redirect.e2e-spec.ts` (nascida na TRK-006) — mantidos lá sem
 * alteração. Esta suíte complementa com asserções mais rigorosas (estado
 * final da "vítima" inalterado, não só o status code), mesmo padrão de
 * `get-category.e2e-spec.ts` manter seu teste local mesmo com
 * `catalog-site-isolation.e2e-spec.ts` existindo.
 */
describe('Bloqueio de acesso cruzado no Tracking (e2e, dedicado — TRK-008)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;
  let productB: Product;
  let offerA: Offer;
  let offerB: Offer;
  let articleB: Article;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'trk008-site-a',
        name: 'Trk008 Site A',
        domain: 'trk008-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'trk008-site-b',
        name: 'Trk008 Site B',
        domain: 'trk008-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto Trk008 A', slug: 'trk008-produto-a' },
    });
    productB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Produto Trk008 Vítima', slug: 'trk008-produto-vitima' },
    });

    offerA = await prisma.offer.create({
      data: {
        siteId: siteA.id,
        productId: productA.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/trk008-produto-a',
      },
    });
    offerB = await prisma.offer.create({
      data: {
        siteId: siteB.id,
        productId: productB.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '150.00',
        affiliateUrl: 'https://mercadolivre.test.com/trk008-produto-vitima',
      },
    });

    articleB = await prisma.article.create({
      data: {
        siteId: siteB.id,
        title: 'Artigo Trk008 Vítima',
        slug: 'trk008-artigo-vitima',
        type: ArticleType.REVIEW,
      },
    });
  });

  afterEach(async () => {
    await prisma.affiliateClick.deleteMany({
      where: { site: { slug: { startsWith: 'trk008-' } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'trk008-' } } } });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'trk008-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'trk008-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'trk008-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function findClicksByOffer(offerId: string) {
    return prisma.affiliateClick.findMany({ where: { offerId } });
  }

  it('siteSlug do Site A + offerId de Oferta do Site B: 404, sem Location, sem clique, Oferta do Site B inalterada', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/r/${siteA.slug}/${offerB.id}`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(await findClicksByOffer(offerB.id)).toHaveLength(0);

    const persistedOffer = await prisma.offer.findUniqueOrThrow({ where: { id: offerB.id } });
    expect(persistedOffer).toMatchObject({
      siteId: siteB.id,
      productId: productB.id,
      affiliateUrl: offerB.affiliateUrl,
      archivedAt: null,
    });
  });

  it('siteSlug do Site A + Oferta válida do Site A + articleId de Artigo do Site B: 404, sem Location, sem clique, Artigo do Site B inalterado', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/r/${siteA.slug}/${offerA.id}`)
      .query({ articleId: articleB.id });

    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(await findClicksByOffer(offerA.id)).toHaveLength(0);

    const persistedArticle = await prisma.article.findUniqueOrThrow({
      where: { id: articleB.id },
    });
    expect(persistedArticle).toMatchObject({
      siteId: siteB.id,
      title: articleB.title,
      slug: articleB.slug,
    });
  });
});
