import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  clickEventsResponseSchema,
  clickFilterOptionsResponseSchema,
  clickRankingsResponseSchema,
  clickSummaryResponseSchema,
} from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import { generateSessionToken, hashSessionToken } from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Marketplace, Role } from '../src/generated/prisma/enums';
import type { Article, Category, Offer, Product, Site, User } from '../src/generated/prisma/client';

/**
 * UXP-006 — dashboard de cliques (e2e com Postgres real).
 *
 * Referência temporal fixa: `asOf = 2026-01-15T15:00:00-03:00`
 * (= 18:00Z). Eventos inseridos diretamente com `clickedAt` controlado
 * (UTC), cobrindo as bordas de dia de São Paulo × UTC.
 */
const SESSION_SECRET = process.env.SESSION_SECRET!;
const PREFIX = 'uxp006-';
const AS_OF = '2026-01-15T15:00:00-03:00';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0';
const BOT_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';

describe('Dashboard de cliques — UXP-006 (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let token: string;
  let siteA: Site;
  let siteB: Site;
  let categoryA: Category;
  let articleA: Article;
  let articleFormula: Article;
  let productA: Product;
  let offerAmazon: Offer;
  let offerShopee: Offer;
  let offerB: Offer;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [ApplicationModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: { email: `${PREFIX}user@test.com`, passwordHash: 'fixture-hash', name: 'Uxp006' },
    });
    const rawToken = generateSessionToken();
    await prisma.session.create({
      data: { userId: user.id, tokenHash: hashSessionToken(SESSION_SECRET, rawToken), expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;

    siteA = await prisma.site.create({
      data: { slug: `${PREFIX}site-a`, name: 'Uxp006 A', domain: `${PREFIX}a.test.com`, locale: 'pt-BR' },
    });
    siteB = await prisma.site.create({
      data: { slug: `${PREFIX}site-b`, name: 'Uxp006 B', domain: `${PREFIX}b.test.com`, locale: 'pt-BR' },
    });
    categoryA = await prisma.category.create({ data: { siteId: siteA.id, name: 'Smartwatches', slug: `${PREFIX}cat` } });
    articleA = await prisma.article.create({
      data: { siteId: siteA.id, type: ArticleType.REVIEW, title: 'Review relógio', slug: `${PREFIX}art`, categoryId: categoryA.id },
    });
    articleFormula = await prisma.article.create({
      data: { siteId: siteA.id, type: ArticleType.REVIEW, title: '=HYPERLINK("x")', slug: `${PREFIX}art-formula` },
    });
    productA = await prisma.product.create({ data: { siteId: siteA.id, name: 'Relógio X', slug: `${PREFIX}prod` } });
    offerAmazon = await prisma.offer.create({
      data: { siteId: siteA.id, productId: productA.id, marketplace: Marketplace.AMAZON, price: '100.00', affiliateUrl: 'https://amazon.example/x' },
    });
    offerShopee = await prisma.offer.create({
      data: { siteId: siteA.id, productId: productA.id, marketplace: Marketplace.SHOPEE, price: '90.00', affiliateUrl: 'https://shopee.example/x' },
    });
    const productB = await prisma.product.create({ data: { siteId: siteB.id, name: 'Produto B', slug: `${PREFIX}prod-b` } });
    offerB = await prisma.offer.create({
      data: { siteId: siteB.id, productId: productB.id, marketplace: Marketplace.AMAZON, price: '10.00', affiliateUrl: 'https://amazon.example/b' },
    });
  });

  afterEach(async () => {
    const sites = { site: { slug: { startsWith: PREFIX } } };
    await prisma.affiliateClick.deleteMany({ where: sites });
    await prisma.offer.deleteMany({ where: sites });
    await prisma.product.deleteMany({ where: sites });
    await prisma.article.deleteMany({ where: sites });
    await prisma.category.deleteMany({ where: sites });
    await prisma.siteUser.deleteMany({ where: sites });
    await prisma.site.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role) {
    await prisma.siteUser.deleteMany({ where: { userId: user!.id, siteId: site.id } });
    await prisma.siteUser.create({ data: { userId: user!.id, siteId: site.id, role, active: true } });
  }

  const cookie = () => `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  const get = (path: string, site: Site = siteA) =>
    request(app!.getHttpServer()).get(`/admin/sites/${site.slug}/clicks/${path}`).set('Cookie', cookie());

  type ClickSeed = {
    at: string;
    offer?: Offer;
    article?: Article | null;
    ua?: string | null;
    outcome?: 'REDIRECTED' | 'OFFER_ARCHIVED' | null;
    snapshot?: boolean;
    site?: Site;
    utmSource?: string | null;
    id?: string;
  };

  async function click(seed: ClickSeed) {
    const offer = seed.offer ?? offerAmazon;
    const article = seed.article === undefined ? articleA : seed.article;
    const legacy = seed.snapshot === false;
    return prisma.affiliateClick.create({
      data: {
        ...(seed.id ? { id: seed.id } : {}),
        siteId: (seed.site ?? siteA).id,
        offerId: offer.id,
        articleId: article?.id ?? null,
        userAgent: seed.ua === undefined ? DESKTOP_UA : seed.ua,
        utmSource: seed.utmSource ?? null,
        clickedAt: new Date(seed.at),
        marketplace: legacy ? null : offer.marketplace,
        articleCategoryId: legacy ? null : (article?.categoryId ?? null),
        outcome: legacy ? null : seed.outcome === undefined ? 'REDIRECTED' : seed.outcome,
      },
    });
  }

  /** Cenário de bordas de dia (todas as horas em UTC; São Paulo = UTC−3). */
  async function seedScenario() {
    await click({ at: '2026-01-15T02:30:00Z' }); // 14/01 23:30 SP → ontem
    await click({ at: '2026-01-15T03:00:00Z' }); // 15/01 00:00 SP → hoje (início semiaberto)
    await click({ at: '2026-01-15T12:00:00Z', ua: MOBILE_UA }); // 15/01 09:00 SP
    await click({ at: '2026-01-15T19:00:00Z' }); // 15/01 16:00 SP → depois do asOf, fora
    await click({ at: '2026-01-14T11:00:00Z', offer: offerShopee }); // 14/01 08:00 SP
    await click({ at: '2026-01-14T19:30:00Z', ua: null }); // 14/01 16:30 SP, UA ausente
    await click({ at: '2026-01-10T15:00:00Z', snapshot: false }); // evento antigo (sem estado)
    await click({ at: '2026-01-13T15:00:00Z', ua: BOT_UA, article: null }); // link direto, bot
    await click({ at: '2026-01-12T15:00:00Z', outcome: 'OFFER_ARCHIVED' });
    await click({ at: '2026-01-15T12:00:00Z', site: siteB, offer: offerB, article: null }); // outro Site
  }

  describe('autorização e tenancy', () => {
    it('sem sessão: 401; sem vínculo com o Site: 403/404', async () => {
      await request(app!.getHttpServer()).get(`/admin/sites/${siteA.slug}/clicks/summary`).expect(401);
      const response = await get('summary');
      expect([403, 404]).toContain(response.status);
    });

    it('VIEWER consulta summary, rankings, eventos e opções; CSV exige EDITOR (403 para VIEWER)', async () => {
      await setRole(siteA, Role.VIEWER);
      await get(`summary?asOf=${encodeURIComponent(AS_OF)}`).expect(200);
      await get(`rankings?dimension=article&asOf=${encodeURIComponent(AS_OF)}`).expect(200);
      await get(`events?asOf=${encodeURIComponent(AS_OF)}`).expect(200);
      await get('filter-options').expect(200);
      await get(`export.csv?asOf=${encodeURIComponent(AS_OF)}`).expect(403);
      await setRole(siteA, Role.EDITOR);
      await get(`export.csv?asOf=${encodeURIComponent(AS_OF)}`).expect(200);
    });

    it('eventos de outro Site nunca entram; filtro com Oferta de outro Site resulta em zero', async () => {
      await setRole(siteA, Role.VIEWER);
      await seedScenario();
      const summary = clickSummaryResponseSchema.parse(
        (await get(`summary?period=7d&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(summary.totals.events).toBe(8);
      const foreign = clickSummaryResponseSchema.parse(
        (await get(`summary?period=7d&offerId=${offerB.id}&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(foreign.totals.events).toBe(0);
      const options = clickFilterOptionsResponseSchema.parse((await get('filter-options').expect(200)).body);
      expect(options.offers.map((offer) => offer.id)).not.toContain(offerB.id);
      expect(options.products.map((product) => product.label)).toEqual(['Relógio X']);
    });
  });

  describe('precisão', () => {
    beforeEach(async () => {
      await setRole(siteA, Role.VIEWER);
      await seedScenario();
    });

    it('hoje (parcial): intervalo semiaberto em São Paulo, comparação com ontem até o mesmo horário, buckets por hora zerados', async () => {
      const body = clickSummaryResponseSchema.parse(
        (await get(`summary?period=today&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(body.range).toMatchObject({
        fromDate: '2026-01-15',
        toDate: '2026-01-15',
        start: '2026-01-15T03:00:00.000Z',
        end: '2026-01-15T18:00:00.000Z',
        isPartial: true,
        granularity: 'hour',
        previous: { start: '2026-01-14T03:00:00.000Z', end: '2026-01-14T18:00:00.000Z' },
      });
      expect(body.totals.events).toBe(2); // 00:00 e 09:00 (16:00 fica depois do asOf)
      expect(body.totals.previousEvents).toBe(1); // ontem 08:00 (23:30 e 16:30 fora do recorte)
      expect(body.today).toEqual({ events: 2, yesterdaySameTime: 1 });
      expect(body.timeseries).toHaveLength(15); // 00h..14h — o bucket das 15h começa no asOf (semiaberto)
      expect(body.timeseries[0]).toMatchObject({ label: '00:00', events: 1 });
      expect(body.timeseries[9]).toMatchObject({ label: '09:00', events: 1 });
      expect(body.timeseries.reduce((sum, bucket) => sum + bucket.events, 0)).toBe(2);
    });

    it('7 dias: totais por resultado e classificação, distintos, série diária zerada, distribuição por hora', async () => {
      const body = clickSummaryResponseSchema.parse(
        (await get(`summary?period=7d&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(body.range.fromDate).toBe('2026-01-09');
      expect(body.totals).toMatchObject({
        events: 8,
        redirected: 6,
        offerArchived: 1,
        outcomeNotRecorded: 1,
        likelyBot: 1,
        botUnknown: 1,
        noBotIndication: 6,
        articlesWithClicks: 1,
        productsWithClicks: 1,
        offersWithClicks: 2,
      });
      expect(body.timeseries.map((bucket) => bucket.events)).toEqual([0, 1, 0, 1, 1, 3, 2]); // 09..15/01
      expect(body.byHour).toHaveLength(24);
      expect(body.byHour.reduce((sum, hour) => sum + hour.events, 0)).toBe(8);
      expect(body.byMarketplace).toEqual(
        expect.arrayContaining([
          { marketplace: 'AMAZON', events: 6 },
          { marketplace: 'SHOPEE', events: 1 },
          { marketplace: null, events: 1 },
        ]),
      );
      expect(body.byDevice).toEqual(expect.arrayContaining([{ device: 'mobile', events: 1 }, { device: 'unknown', events: 1 }]));
    });

    it('filtros combináveis: bot, resultado, marketplace (só eventos com marketplace registrado) e categoria no clique', async () => {
      const total = async (query: string) =>
        clickSummaryResponseSchema.parse(
          (await get(`summary?period=7d&asOf=${encodeURIComponent(AS_OF)}&${query}`).expect(200)).body,
        ).totals.events;
      expect(await total('botClass=likely_bot')).toBe(1);
      expect(await total('botClass=unknown')).toBe(1);
      expect(await total('outcome=not_recorded')).toBe(1);
      expect(await total('outcome=OFFER_ARCHIVED')).toBe(1);
      expect(await total('marketplace=AMAZON')).toBe(6);
      expect(await total(`categoryId=${categoryA.id}`)).toBe(6);
      expect(await total(`marketplace=AMAZON&botClass=no_indication&outcome=REDIRECTED`)).toBe(3);
    });

    it('rankings: categoria do Artigo no clique com buckets explícitos; percentuais; ordem determinística', async () => {
      const body = clickRankingsResponseSchema.parse(
        (await get(`rankings?dimension=category&period=7d&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(body.totalEvents).toBe(8);
      expect(body.items.map((item) => [item.kind, item.label, item.events])).toEqual([
        ['entity', 'Smartwatches', 6],
        // empate (1 × 1): desempate determinístico pelo tipo do bucket
        ['no_article', 'Sem artigo (link direto)', 1],
        ['not_recorded', 'Categoria não registrada no clique', 1],
      ]);
      expect(body.items[0]!.share).toBeCloseTo(0.75);
      const marketplaces = clickRankingsResponseSchema.parse(
        (await get(`rankings?dimension=marketplace&period=7d&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      // empate Shopee × não registrado: valores registrados antes dos buckets especiais
      expect(marketplaces.items.map((item) => item.label)).toEqual(['Amazon', 'Shopee', 'Não registrado']);
    });

    it('período anterior sem eventos: previousEvents = 0 (sem crescimento inventado)', async () => {
      const body = clickSummaryResponseSchema.parse(
        (await get(`summary?period=custom&from=2026-01-14&to=2026-01-15&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(body.range.previous).toEqual({ start: '2026-01-12T03:00:00.000Z', end: '2026-01-13T18:00:00.000Z' });
      expect(body.totals.events).toBe(5); // 14/01 inteiro (3) + 15/01 até o asOf (2)
      const empty = clickSummaryResponseSchema.parse(
        (await get(`summary?period=custom&from=2025-06-01&to=2025-06-02&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(empty.totals).toMatchObject({ events: 0, previousEvents: 0 });
      expect(empty.range.isPartial).toBe(false);
    });

    it('validação: período personalizado acima de 366 dias e fim antes do início → 422', async () => {
      // Convenção do projeto: ZodValidationPipe responde 422.
      await get('summary?period=custom&from=2025-01-01&to=2026-01-02').expect(422);
      await get('summary?period=custom&from=2026-01-10&to=2026-01-09').expect(422);
      await get('summary?period=custom&from=2026-01-10').expect(422);
      await get(`events?pageSize=101&asOf=${encodeURIComponent(AS_OF)}`).expect(422);
    });

    it('eventos: paginação no servidor e ordem determinística em empate de horário (id)', async () => {
      const ids = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'];
      for (const id of ids) {
        await click({ at: '2026-01-11T15:00:00Z', id });
      }
      const page = clickEventsResponseSchema.parse(
        (await get(`events?period=custom&from=2026-01-11&to=2026-01-11&sort=clickedAt_desc&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(page.items.map((item) => item.id)).toEqual([...ids].reverse());
      const all = clickEventsResponseSchema.parse(
        (await get(`events?period=7d&pageSize=3&page=2&asOf=${encodeURIComponent(AS_OF)}`).expect(200)).body,
      );
      expect(all).toMatchObject({ total: 10, totalPages: 4, page: 2 });
      expect(all.items).toHaveLength(3);
      expect(all.items[0]).not.toHaveProperty('userAgent');
      expect(all.items[0]).not.toHaveProperty('referer');
    });
  });

  describe('CSV', () => {
    it('respeita filtros, sem user-agent/referer/IDs, com proteção contra injeção de fórmula', async () => {
      await setRole(siteA, Role.EDITOR);
      await click({ at: '2026-01-15T12:00:00Z', article: articleFormula, utmSource: '+cmd' });
      await click({ at: '2026-01-15T13:00:00Z', ua: BOT_UA });
      const response = await get(`export.csv?period=today&botClass=no_indication&asOf=${encodeURIComponent(AS_OF)}`).expect(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('cliques-2026-01-15-a-2026-01-15.csv');
      expect(response.headers['cache-control']).toBe('no-store');
      const lines = response.text.replace(/^\uFEFF/, '').trim().split('\r\n');
      expect(lines).toHaveLength(2); // cabeçalho + 1 (o bot ficou de fora pelo filtro)
      expect(lines[0]).toContain('"data_hora_sao_paulo"');
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
      expect(lines[1]).toContain(`"'+cmd"`);
      expect(lines[1]).toContain('"2026-01-15 09:00:00"');
      expect(response.text).not.toContain('Mozilla');
      expect(response.text).not.toContain(offerAmazon.id);
    });

    it('acima de 10.000 eventos no filtro → 422 (nunca arquivo truncado)', async () => {
      await setRole(siteA, Role.EDITOR);
      await prisma.affiliateClick.createMany({
        data: Array.from({ length: 10_001 }, () => ({
          siteId: siteA.id,
          offerId: offerAmazon.id,
          clickedAt: new Date('2026-01-15T12:00:00Z'),
          outcome: 'REDIRECTED' as const,
          marketplace: Marketplace.AMAZON,
        })),
      });
      const response = await get(`export.csv?period=today&asOf=${encodeURIComponent(AS_OF)}`).expect(422);
      expect(response.body.message).toContain('10.000');
    });
  });

  describe('tracking preservado + estado no momento do clique (via /r/)', () => {
    it('302 grava marketplace, categoria e outcome REDIRECTED; 410 grava OFFER_ARCHIVED; limites de entrada aplicados', async () => {
      const longUtm = 'x'.repeat(300);
      await request(app!.getHttpServer())
        .get(`/r/${siteA.slug}/${offerAmazon.id}?articleId=${articleA.id}&utm_source=${longUtm}`)
        .set('User-Agent', 'U'.repeat(700))
        .set('Referer', 'https://busca.example/r?q=pessoa%40mail.com')
        .expect(302)
        .expect('Location', 'https://amazon.example/x');
      await prisma.offer.update({ where: { id: offerShopee.id }, data: { archivedAt: new Date() } });
      await request(app!.getHttpServer()).get(`/r/${siteA.slug}/${offerShopee.id}?articleId=${articleA.id}`).expect(410);

      const [redirected, archived] = await Promise.all([
        prisma.affiliateClick.findFirstOrThrow({ where: { offerId: offerAmazon.id } }),
        prisma.affiliateClick.findFirstOrThrow({ where: { offerId: offerShopee.id } }),
      ]);
      expect(redirected).toMatchObject({
        marketplace: 'AMAZON',
        articleCategoryId: categoryA.id,
        outcome: 'REDIRECTED',
        referer: 'https://busca.example/r',
      });
      expect(redirected.utmSource).toHaveLength(200);
      expect(redirected.userAgent).toHaveLength(512);
      expect(archived).toMatchObject({ marketplace: 'SHOPEE', outcome: 'OFFER_ARCHIVED' });

      // Editar a Oferta depois não altera o marketplace registrado no clique.
      await prisma.offer.update({ where: { id: offerAmazon.id }, data: { marketplace: Marketplace.MAGALU } });
      const after = await prisma.affiliateClick.findFirstOrThrow({ where: { offerId: offerAmazon.id } });
      expect(after.marketplace).toBe('AMAZON');
    });
  });
});
