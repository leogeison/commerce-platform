import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { publicArticleSchema, publicCategorySchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace, Role } from '../src/generated/prisma/enums';
import type { Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'qa005-user@test.com';

/**
 * QA-005 — integração ponta a ponta entre o caminho de escrita do Admin e a
 * API pública. Não substitui `public-articles.e2e-spec.ts` (PUB-002),
 * `get-public-article.e2e-spec.ts` (PUB-003), `get-public-category.e2e-spec.ts`
 * (PUB-004) nem `public-article-status-exposure.e2e-spec.ts` (PUB-006), que
 * seguem intactas — cada uma continua sendo a fonte da matriz detalhada
 * daquele endpoint, sempre semeando o Artigo/Categoria direto via Prisma.
 *
 * Esta suíte prova só a composição real: um único Artigo, criado e
 * transicionado exclusivamente via rotas HTTP do Admin (nunca `status`
 * escrito direto no banco), consultado nos endpoints públicos reais a cada
 * checkpoint — mesmo raciocínio de `article-lifecycle.e2e-spec.ts` (QA-004),
 * aplicado à fronteira Admin → Público em vez de só à máquina de estados.
 *
 * `ApplicationModule` (mesmo import de `article-lifecycle.e2e-spec.ts`)
 * expõe, no mesmo `TestingModule`, tanto os controllers administrativos
 * (`ArticlesController`, `PublishArticleController`, `ArchiveArticleController`)
 * quanto os públicos (`Editorial`/`Catalog` os registram junto). `RevalidationPort`
 * sobrescrita por um fake — esta suíte prova a integração admin↔público, não
 * a chamada HTTP real de revalidação (já coberta em
 * `http-revalidation.adapter.spec.ts`/`publish-article.e2e-spec.ts`/
 * `archive-article.e2e-spec.ts`).
 *
 * Usuário único `OWNER`: cobre tanto as etapas que exigem `EDITOR` (criar,
 * vincular Produto, `submit-for-review`, `publish`) quanto a que exige
 * `OWNER` (`archive`) — mesmo critério de `article-lifecycle.e2e-spec.ts`.
 */
describe('Integração Admin → API pública (e2e — QA-005)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let site: Site;
  let category: Category;
  let product: Product;
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
        name: 'Qa005 User',
      },
    });

    site = await prisma.site.create({
      data: {
        slug: 'qa005-site',
        name: 'Qa005 Site',
        domain: 'qa005-site.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: site.id, role: Role.OWNER, active: true },
    });

    category = await prisma.category.create({
      data: { siteId: site.id, name: 'Categoria Qa005', slug: 'qa005-categoria' },
    });
    product = await prisma.product.create({
      data: { siteId: site.id, name: 'Produto Qa005', slug: 'qa005-produto' },
    });
    await prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/qa005-produto',
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
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: 'qa005-site' } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: 'qa005-site' } } });
    await prisma.offer.deleteMany({ where: { site: { slug: 'qa005-site' } } });
    await prisma.product.deleteMany({ where: { site: { slug: 'qa005-site' } } });
    await prisma.category.deleteMany({ where: { site: { slug: 'qa005-site' } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: 'qa005-site' } } });
    await prisma.site.deleteMany({ where: { slug: 'qa005-site' } });
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

  async function publicListResponse() {
    return request(app!.getHttpServer()).get(`/public/sites/${site.slug}/articles`);
  }

  async function publicDetailResponse(slug: string) {
    return request(app!.getHttpServer()).get(`/public/sites/${site.slug}/articles/${slug}`);
  }

  it('DRAFT/PENDING_REVIEW nunca expostos; PUBLISHED exposto com dados corretos; ARCHIVED deixa de ser exposto', async () => {
    const articleSlug = 'qa005-artigo-admin-para-publico';

    // 1. Criar (EDT-006) — Categoria/metaDescription/capa já preenchidas,
    // para que `publish` mais adiante não precise de nenhuma outra etapa de
    // preparação além do vínculo de Produto.
    const createResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Admin para Público',
        slug: articleSlug,
        categoryId: category.id,
        metaDescription: 'Descrição válida para SEO.',
        coverImageUrl: 'https://cdn.test.com/qa005-capa.jpg',
      });

    expect(createResponse.status).toBe(201);
    const articleId = createResponse.body.id as string;

    // Checkpoint DRAFT: nunca exposto pela API pública.
    const listAfterCreate = await publicListResponse();
    expect(listAfterCreate.status).toBe(200);
    expect(listAfterCreate.body.total).toBe(0);
    expect(listAfterCreate.body.items).toEqual([]);

    const detailAfterCreate = await publicDetailResponse(articleSlug);
    expect(detailAfterCreate.status).toBe(404);

    // 2. Vincular Produto (EDT-010) — só permitido em DRAFT, condição de
    // publicação (≥1 Produto com Oferta válida).
    const linkResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ productId: product.id });

    expect(linkResponse.status).toBe(201);

    // 3. DRAFT → PENDING_REVIEW (EDT-012).
    const submitResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/submit-for-review`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.status).toBe('PENDING_REVIEW');

    // Checkpoint PENDING_REVIEW: continua nunca exposto pela API pública.
    const listAfterSubmit = await publicListResponse();
    expect(listAfterSubmit.status).toBe(200);
    expect(listAfterSubmit.body.total).toBe(0);
    expect(listAfterSubmit.body.items).toEqual([]);

    const detailAfterSubmit = await publicDetailResponse(articleSlug);
    expect(detailAfterSubmit.status).toBe(404);

    // 4. PENDING_REVIEW → PUBLISHED (REV-003/APP-002/EDT-014).
    const publishResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.status).toBe('PUBLISHED');

    // Confirma o status persistido via Prisma antes de consultar a API
    // pública — não confia só no corpo da resposta do Admin.
    const persistedAfterPublish = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    expect(persistedAfterPublish.status).toBe('PUBLISHED');

    // Checkpoint PUBLISHED: exposto na listagem e no detalhe, com os
    // mesmos dados enviados na criação/vínculo.
    const listAfterPublish = await publicListResponse();
    expect(listAfterPublish.status).toBe(200);
    expect(listAfterPublish.body.total).toBe(1);
    expect(listAfterPublish.body.items).toHaveLength(1);
    expect(listAfterPublish.body.items[0]).toMatchObject({
      id: articleId,
      slug: articleSlug,
      categorySlug: category.slug,
    });

    const detailAfterPublish = await publicDetailResponse(articleSlug);
    expect(detailAfterPublish.status).toBe(200);
    expect(publicArticleSchema.safeParse(detailAfterPublish.body).success).toBe(true);
    expect(detailAfterPublish.body).toMatchObject({
      id: articleId,
      title: 'Artigo Admin para Público',
      slug: articleSlug,
      categorySlug: category.slug,
      metaDescription: 'Descrição válida para SEO.',
      coverImageUrl: 'https://cdn.test.com/qa005-capa.jpg',
    });
    expect(detailAfterPublish.body.products).toHaveLength(1);
    expect(detailAfterPublish.body.products[0]).toMatchObject({
      id: product.id,
      name: product.name,
      position: 0,
    });

    // Categoria criada pelo Admin também resolve do lado público — 1
    // chamada a mais reaproveitando o mesmo fluxo, não uma nova matriz
    // (isolamento/arquivamento/404 continuam só em `get-public-category.e2e-spec.ts`).
    const categoryResponse = await request(app!.getHttpServer()).get(
      `/public/sites/${site.slug}/categories/${category.slug}`,
    );
    expect(categoryResponse.status).toBe(200);
    expect(publicCategorySchema.safeParse(categoryResponse.body).success).toBe(true);
    expect(categoryResponse.body).toEqual({ name: category.name, slug: category.slug });

    // 5. PUBLISHED → ARCHIVED (REV-004/EDT-015).
    const archiveResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/archive`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.status).toBe('ARCHIVED');

    // Confirma o status persistido via Prisma antes de validar que a API
    // pública deixou de expor o conteúdo.
    const persistedAfterArchive = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    expect(persistedAfterArchive.status).toBe('ARCHIVED');

    // Checkpoint ARCHIVED: deixa de ser exposto pela API pública.
    const listAfterArchive = await publicListResponse();
    expect(listAfterArchive.status).toBe(200);
    expect(listAfterArchive.body.total).toBe(0);
    expect(listAfterArchive.body.items).toEqual([]);

    const detailAfterArchive = await publicDetailResponse(articleSlug);
    expect(detailAfterArchive.status).toBe(404);
  });
});
