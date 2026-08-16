import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApplicationModule } from '../src/modules/application/application.module';
import { UploadsModule } from '../src/modules/uploads/uploads.module';
import {
  STORAGE_PORT,
  type StoragePort,
} from '../src/modules/uploads/domain/storage.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, ArticleStatus, Marketplace, Role } from '../src/generated/prisma/enums';
import type {
  Article,
  Author,
  Category,
  Offer,
  Product,
  Site,
  User,
} from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão de `catalog-site-isolation.e2e-spec.ts` (CAT-022).
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const ATTACKER_EMAIL = 'qa003-attacker@test.com';

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);

/**
 * QA-003 — gate transversal pequeno e único, consolidando (sem substituir)
 * a cobertura detalhada já existente em `catalog-site-isolation.e2e-spec.ts`
 * (CAT-022), `editorial-site-isolation.e2e-spec.ts` (EDT-017),
 * `tracking-site-isolation.e2e-spec.ts` (TRK-008), `site-isolation.e2e-spec.ts`/
 * `site-authorization.guard.e2e-spec.ts` (AUTH-009/010) e
 * `upload-image.e2e-spec.ts`. Nenhum desses arquivos foi alterado por esta
 * tarefa.
 *
 * Sete casos, um por recurso/risco tenant-aware relevante (não "um teste por
 * endpoint"): Categoria (leitura), Produto (vínculo na criação via
 * `categoryId`), Oferta (alteração via chave composta `siteId+productId+id`,
 * usando a rota real aninhada sob `products/:productId/offers/:id/archive`),
 * Autor (exclusão física), Artigo↔Produto (vínculo cross-entidade), redirect
 * de Tracking (leitura pública com efeito colateral) e Upload (único vetor
 * real: `siteSlug` de outro Site, sem entidade persistida própria).
 *
 * `attacker` é `OWNER` só no Site A (nunca tem `SiteUser` no Site B) — Role
 * mais alta da hierarquia, cobre o `@MinRole` de todas as sete rotas
 * (`VIEWER` a `OWNER`) com um único usuário, mesmo critério de
 * `catalog-site-isolation.e2e-spec.ts`/`editorial-site-isolation.e2e-spec.ts`.
 * Todos os sete casos usam o `siteSlug` do Site A (autorizado) contra um
 * recurso/referência do Site B — o vetor "Site B na URL, sem membership,
 * 403" já está exaustivamente coberto pelas suítes dedicadas de cada
 * domínio e não é repetido aqui.
 *
 * `ApplicationModule` traz `CatalogModule`/`EditorialModule`/`TrackingModule`
 * (e os controllers próprios de `application/`, incluindo
 * `OfferArchiveController`/`AffiliateRedirectController`) — cobre os seis
 * primeiros casos. `UploadsModule` é importado à parte (não é consumido por
 * `ApplicationModule`) só para o sétimo caso, com `STORAGE_PORT`
 * sobrescrito por um fake em memória, mesmo padrão de
 * `upload-image.e2e-spec.ts` — nenhum código de produção alterado para
 * viabilizar o spy.
 */
describe('Bloqueio de acesso cruzado consolidado (e2e — QA-003)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let fakeStoragePort: StoragePort;
  let attacker: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let categoryB: Category;
  let productB: Product;
  let offerB: Offer;
  let authorB: Author;
  let articleA: Article;
  let attackerToken: string;

  beforeEach(async () => {
    fakeStoragePort = {
      upload: jest.fn().mockResolvedValue({ url: 'memory://fake-upload.jpg' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule, UploadsModule],
    })
      .overrideProvider(STORAGE_PORT)
      .useValue(fakeStoragePort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    attacker = await prisma.user.create({
      data: {
        email: ATTACKER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Qa003 Attacker',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'qa003-site-a',
        name: 'Qa003 Site A',
        domain: 'qa003-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'qa003-site-b',
        name: 'Qa003 Site B',
        domain: 'qa003-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: attacker.id, siteId: siteA.id, role: Role.OWNER, active: true },
    });

    categoryB = await prisma.category.create({
      data: { siteId: siteB.id, name: 'Categoria Vítima', slug: 'qa003-categoria-vitima' },
    });
    productB = await prisma.product.create({
      data: {
        siteId: siteB.id,
        categoryId: categoryB.id,
        name: 'Produto Vítima',
        slug: 'qa003-produto-vitima',
      },
    });
    offerB = await prisma.offer.create({
      data: {
        siteId: siteB.id,
        productId: productB.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '150.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/qa003-vitima',
      },
    });
    authorB = await prisma.author.create({
      data: { siteId: siteB.id, name: 'Autor Vítima' },
    });

    // Artigo do próprio atacante, em Site A, DRAFT — necessário para o
    // caso 5 (vínculo Artigo↔Produto exige um Artigo elegível em DRAFT).
    articleA = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Artigo do Atacante',
        slug: 'qa003-artigo-atacante',
        type: ArticleType.REVIEW,
        status: ArticleStatus.DRAFT,
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: attacker.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    attackerToken = rawToken;
  });

  afterEach(async () => {
    // `attacker` pode nunca ter sido atribuído se o `beforeEach` falhar
    // antes (ex.: Postgres indisponível) — mesmo cuidado já usado nas
    // demais suítes de isolamento do projeto. `articleProduct`/
    // `affiliateClick` antes das entidades que referenciam: FKs bloqueariam
    // a exclusão se a ordem fosse invertida.
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'qa003-' } } } },
    });
    await prisma.affiliateClick.deleteMany({
      where: { site: { slug: { startsWith: 'qa003-' } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.category.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.author.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: { startsWith: 'qa003-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'qa003-' } } });
    if (attacker?.id) {
      await prisma.session.deleteMany({ where: { userId: attacker.id } });
      await prisma.user.deleteMany({ where: { id: attacker.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${attackerToken}`;
  }

  it('Catalog — Categoria (leitura): GET /categories/:id com id do Site B via siteSlug do Site A: 404', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/admin/sites/${siteA.slug}/categories/${categoryB.id}`)
      .set('Cookie', cookieHeader());

    expect(response.status).toBe(404);
  });

  it('Catalog — Produto (vínculo na criação): POST /products com categoryId do Site B: 422, nenhum Produto criado', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        categoryId: categoryB.id,
        name: 'Tentativa Cruzada QA-003',
        slug: 'qa003-produto-tentativa-cruzada',
      });

    expect(response.status).toBe(422);

    const persisted = await prisma.product.count({
      where: { siteId: siteA.id, slug: 'qa003-produto-tentativa-cruzada' },
    });
    expect(persisted).toBe(0);
  });

  it('Catalog — Oferta (alteração, chave composta): POST /products/:productId/offers/:id/archive com productId do Site B via siteSlug do Site A: 404, Oferta do Site B inalterada', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/products/${productB.id}/offers/${offerB.id}/archive`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);

    const persisted = await prisma.offer.findUniqueOrThrow({ where: { id: offerB.id } });
    expect(persisted.archivedAt).toBeNull();
  });

  it('Editorial — Autor (exclusão): DELETE /authors/:id com id do Site B via siteSlug do Site A: 404, Autor do Site B permanece', async () => {
    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${authorB.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);

    const persisted = await prisma.author.findUnique({ where: { id: authorB.id } });
    expect(persisted).not.toBeNull();
  });

  it('Editorial — Artigo↔Produto (vínculo cross-entidade): POST /articles/:id/products (Artigo do Site A) com productId do Site B: 422, nenhum vínculo criado', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${articleA.id}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ productId: productB.id });

    expect(response.status).toBe(422);

    const count = await prisma.articleProduct.count({
      where: { siteId: siteA.id, articleId: articleA.id },
    });
    expect(count).toBe(0);
  });

  it('Tracking — redirect (leitura pública + efeito colateral): GET /r/:siteSlug/:offerId com offerId do Site B via siteSlug do Site A: 404, sem Location, sem clique, Oferta do Site B inalterada', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/r/${siteA.slug}/${offerB.id}`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();

    const clicks = await prisma.affiliateClick.findMany({ where: { offerId: offerB.id } });
    expect(clicks).toHaveLength(0);

    const persisted = await prisma.offer.findUniqueOrThrow({ where: { id: offerB.id } });
    expect(persisted).toMatchObject({
      siteId: siteB.id,
      productId: productB.id,
      affiliateUrl: offerB.affiliateUrl,
      archivedAt: null,
    });
  });

  it('Uploads (único vetor real): POST /uploads/images com siteSlug do Site B (atacante sem membership lá): 403 antes de qualquer efeito, StoragePort nunca chamado', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteB.slug}/uploads/images`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .field('purpose', 'PRODUCT')
      .attach('file', VALID_JPEG_BYTES, 'foto.jpg');

    expect(response.status).toBe(403);
    expect(fakeStoragePort.upload).not.toHaveBeenCalled();
  });
});
