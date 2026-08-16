import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Offer, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'qa006-user@test.com';

/**
 * QA-006 — integração ponta a ponta entre o arquivamento real de Oferta
 * (Admin) e o redirect público. Não substitui `affiliate-redirect.e2e-spec.ts`
 * (TRK-002 a TRK-007), `tracking-site-isolation.e2e-spec.ts` (TRK-008) nem o
 * case 6 de `multi-tenant-isolation.e2e-spec.ts` (QA-003), que seguem
 * intactos — cada um continua sendo a fonte da matriz detalhada do redirect
 * (302/410/404/422/429, UTM, isolamento entre Sites), sempre com a Oferta
 * arquivada semeada direto via Prisma.
 *
 * Esta suíte prova só a composição real: uma única Oferta, arquivada
 * exclusivamente via rota HTTP do Admin (`archivedAt` nunca escrito direto
 * no banco), consultada no redirect público real antes e depois — mesmo
 * raciocínio de `article-lifecycle.e2e-spec.ts` (QA-004) e
 * `public-api-from-admin-write.e2e-spec.ts` (QA-005), aplicado à fronteira
 * Admin → Tracking.
 *
 * Comportamento de `AffiliateClick` deliberadamente preservado, não
 * alterado: `affiliate-redirect.e2e-spec.ts` já prova que o `410` de Oferta
 * arquivada registra clique (não suprime) — esta suíte confirma o mesmo
 * comportamento na composição real (2 cliques ao final: um por acesso),
 * sem tratar isso como bug e sem tocar `HandleAffiliateRedirectUseCase`.
 *
 * `ApplicationModule` expõe, no mesmo `TestingModule`, tanto
 * `OfferArchiveController` (Admin, REV-013) quanto `AffiliateRedirectController`
 * (público, TRK-006). `RevalidationPort` sobrescrita por um fake, mesmo
 * padrão de `offer-archive-and-revalidate.e2e-spec.ts` — esta suíte prova a
 * integração archive→redirect, não a chamada HTTP real de revalidação.
 */
describe('Arquivamento de Oferta (Admin) afeta o redirect público (e2e — QA-006)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let site: Site;
  let product: Product;
  let offer: Offer;
  let token: string;
  let revalidationPort: jest.Mocked<RevalidationPort>;

  beforeEach(async () => {
    revalidationPort = { revalidate: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    })
      .overrideProvider(REVALIDATION_PORT)
      .useValue(revalidationPort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Qa006 User',
      },
    });

    site = await prisma.site.create({
      data: {
        slug: 'qa006-site',
        name: 'Qa006 Site',
        domain: 'qa006-site.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: site.id, role: Role.OWNER, active: true },
    });

    product = await prisma.product.create({
      data: { siteId: site.id, name: 'Produto Qa006', slug: 'qa006-produto' },
    });
    offer = await prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/qa006-produto',
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    // `user` pode nunca ter sido atribuído se o `beforeEach` falhar antes
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e.
    await prisma.affiliateClick.deleteMany({ where: { site: { slug: 'qa006-site' } } });
    await prisma.offer.deleteMany({ where: { site: { slug: 'qa006-site' } } });
    await prisma.product.deleteMany({ where: { site: { slug: 'qa006-site' } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: 'qa006-site' } } });
    await prisma.site.deleteMany({ where: { slug: 'qa006-site' } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  function findClicksByOffer() {
    return prisma.affiliateClick.findMany({ where: { offerId: offer.id } });
  }

  it('Oferta ativa: 302; após archive real via Admin: 410, sem Location, 2 cliques no total', async () => {
    // 1. Oferta ativa: redirect real responde 302, clique registrado.
    const firstResponse = await request(app!.getHttpServer())
      .get(`/r/${site.slug}/${offer.id}`)
      .redirects(0);

    expect(firstResponse.status).toBe(302);
    expect(firstResponse.headers.location).toBe(offer.affiliateUrl);

    const clicksAfterFirst = await findClicksByOffer();
    expect(clicksAfterFirst).toHaveLength(1);

    // 2. Arquivar via rota Admin real (REV-013), não via Prisma direto.
    const archiveResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/products/${product.id}/offers/${offer.id}/archive`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(archiveResponse.status).toBe(200);

    // Confirma `archivedAt` persistido via Prisma antes de consultar o
    // redirect de novo.
    const persistedOffer = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(persistedOffer.archivedAt).not.toBeNull();

    // 3. Mesma Oferta, mesmo redirect: agora 410, sem Location. O clique
    // deste segundo acesso também é registrado — comportamento já
    // estabelecido e testado em `affiliate-redirect.e2e-spec.ts`, não
    // alterado aqui.
    const secondResponse = await request(app!.getHttpServer())
      .get(`/r/${site.slug}/${offer.id}`)
      .redirects(0);

    expect(secondResponse.status).toBe(410);
    expect(secondResponse.headers.location).toBeUndefined();

    const clicksAfterSecond = await findClicksByOffer();
    expect(clicksAfterSecond).toHaveLength(2);
  });
});
