import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
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
const USER_EMAIL = 'trk010-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `DELETE /admin/sites/:siteSlug/products/:productId/offers/:id` (e2e,
 * TRK-010). Exige Postgres real (mesmo requisito dos demais e2e do
 * projeto). Mesmos moldes de `remove-product.e2e-spec.ts` (APP-003).
 */
describe('DELETE /admin/sites/:siteSlug/products/:productId/offers/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Trk010 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'trk010-site-a',
        name: 'Trk010 Site A',
        domain: 'trk010-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'trk010-site-b',
        name: 'Trk010 Site B',
        domain: 'trk010-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto Trk010 A', slug: 'trk010-produto-a' },
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
    await prisma.affiliateClick.deleteMany({
      where: { site: { slug: { startsWith: 'trk010-' } } },
    });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'trk010-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'trk010-' } } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: { startsWith: 'trk010-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'trk010-' } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role): Promise<void> {
    await prisma.siteUser.deleteMany({ where: { userId: user!.id, siteId: site.id } });
    await prisma.siteUser.create({
      data: { userId: user!.id, siteId: site.id, role, active: true },
    });
  }

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  async function createOffer(site: Site, product: Product): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/trk010-produto-a',
      },
    });
  }

  function deleteRequest(site: Site, productId: string, offerId: string) {
    return request(app!.getHttpServer())
      .delete(`/admin/sites/${site.slug}/products/${productId}/offers/${offerId}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso: 204 sem corpo, Oferta removida do banco (sem clique registrado)', async () => {
    await setRole(siteA, Role.OWNER);
    const offer = await createOffer(siteA, productA);

    const response = await deleteRequest(siteA, productA.id, offer.id);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted).toBeNull();
  });

  it('com AffiliateClick registrado: 409, Oferta e clique permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const offer = await createOffer(siteA, productA);
    const click = await prisma.affiliateClick.create({
      data: { siteId: siteA.id, offerId: offer.id },
    });

    const response = await deleteRequest(siteA, productA.id, offer.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.message).toContain('clique');

    const persistedOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    const persistedClick = await prisma.affiliateClick.findUnique({ where: { id: click.id } });
    expect(persistedOffer).not.toBeNull();
    expect(persistedClick).not.toBeNull();
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, productA.id, NONEXISTENT_ID);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Oferta real de outro Site, acessada pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.OWNER);
    const productB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Produto Trk010 B', slug: 'trk010-produto-b' },
    });
    const offerFromSiteB = await createOffer(siteB, productB);

    const response = await deleteRequest(siteA, productA.id, offerFromSiteB.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.findUnique({ where: { id: offerFromSiteB.id } });
    expect(persisted).not.toBeNull();
  });

  it('Oferta real do próprio Site, mas sob productId de outro Produto: 404 (recurso não pertence ao endereço usado)', async () => {
    await setRole(siteA, Role.OWNER);
    const otherProductA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Outro Produto Trk010 A', slug: 'trk010-outro-produto-a' },
    });
    const offer = await createOffer(siteA, productA);

    const response = await deleteRequest(siteA, otherProductA.id, offer.id);

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted).not.toBeNull();
  });

  it('Role insuficiente (EDITOR): 403, Oferta permanece no banco', async () => {
    await setRole(siteA, Role.EDITOR);
    const offer = await createOffer(siteA, productA);

    const response = await deleteRequest(siteA, productA.id, offer.id);

    expect(response.status).toBe(403);

    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted).not.toBeNull();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/products/${productA.id}/offers/${offer.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const offer = await createOffer(siteA, productA);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/products/${productA.id}/offers/${offer.id}`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await deleteRequest(siteA, productA.id, 'nao-e-um-uuid');

    expect(response.status).toBe(422);
  });
});
