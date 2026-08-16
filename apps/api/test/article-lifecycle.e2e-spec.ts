import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { articleAdminSchema } from '@commerce-platform/contracts';
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
const USER_EMAIL = 'qa004-user@test.com';

/**
 * QA-004 — ciclo editorial completo (e2e), consolidação final da máquina de
 * estados de `Article`. Não substitui as suítes dedicadas de cada transição
 * (`submit-article-for-review`, `revert-article-to-draft`, `publish-article`,
 * `archive-article`, `restore-article-to-draft`), que continuam sendo a
 * fonte da matriz de status de origem válido/inválido — este arquivo prova
 * só a composição sequencial real: um único Article percorrendo, via rotas
 * HTTP reais, o ciclo documentado na Architecture.md ("Editar um artigo
 * arquivado exige `ARCHIVED → DRAFT → editar → PENDING_REVIEW →
 * PUBLISHED`"):
 *
 * `DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED → DRAFT → editar →
 * PENDING_REVIEW → PUBLISHED`.
 *
 * Sem reseed manual de status entre etapas — cada transição acontece só
 * via chamada HTTP real; o estado persistido é conferido via Prisma logo
 * depois de cada etapa relevante, não só o corpo da resposta.
 *
 * `ApplicationModule` (mesmo import de `publish-article.e2e-spec.ts`/
 * `archive-article.e2e-spec.ts`) expõe `ArticlesController` (Editorial) e
 * `PublishArticleController`/`ArchiveArticleController` (Application) no
 * mesmo `TestingModule`. `RevalidationPort` sobrescrita por um fake — este
 * teste prova a composição do workflow, não a chamada HTTP real de
 * revalidação (já coberta em `http-revalidation.adapter.spec.ts`/
 * `publish-article.e2e-spec.ts`/`archive-article.e2e-spec.ts`).
 *
 * Usuário único `OWNER` no Site: cobre tanto as etapas que exigem `EDITOR`
 * (criar, vincular Produto, editar, `submit-for-review`, `publish`) quanto
 * as que exigem `OWNER` (`archive`, `restore-to-draft`) — hierarquia de
 * Role inclusiva, mesmo critério já provado em
 * `site-authorization.guard.e2e-spec.ts`.
 */
describe('Ciclo editorial completo de Article (e2e — QA-004)', () => {
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
        name: 'Qa004 User',
      },
    });

    site = await prisma.site.create({
      data: {
        slug: 'qa004-site',
        name: 'Qa004 Site',
        domain: 'qa004-site.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: site.id, role: Role.OWNER, active: true },
    });

    category = await prisma.category.create({
      data: { siteId: site.id, name: 'Categoria Qa004', slug: 'qa004-categoria' },
    });
    product = await prisma.product.create({
      data: { siteId: site.id, name: 'Produto Qa004', slug: 'qa004-produto' },
    });
    await prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '99.90',
        affiliateUrl: 'https://loja.test.com/qa004-produto',
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
      where: { article: { site: { slug: 'qa004-site' } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: 'qa004-site' } } });
    await prisma.offer.deleteMany({ where: { site: { slug: 'qa004-site' } } });
    await prisma.product.deleteMany({ where: { site: { slug: 'qa004-site' } } });
    await prisma.category.deleteMany({ where: { site: { slug: 'qa004-site' } } });
    await prisma.siteUser.deleteMany({ where: { site: { slug: 'qa004-site' } } });
    await prisma.site.deleteMany({ where: { slug: 'qa004-site' } });
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

  it('DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED → DRAFT → editar → PENDING_REVIEW → PUBLISHED', async () => {
    // 1. Criar (EDT-006) — já nasce com Categoria/metaDescription/capa
    // preenchidas, para que o primeiro `publish` não precise de nenhuma
    // outra etapa de preparação além do vínculo de Produto (passo 2).
    const createResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo do ciclo completo',
        slug: 'qa004-artigo-ciclo',
        categoryId: category.id,
        metaDescription: 'Descrição válida para SEO.',
        coverImageUrl: 'https://cdn.test.com/qa004-capa.jpg',
      });

    expect(createResponse.status).toBe(201);
    expect(articleAdminSchema.safeParse(createResponse.body).success).toBe(true);
    expect(createResponse.body.status).toBe('DRAFT');
    const articleId = createResponse.body.id as string;

    let persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('DRAFT');

    // 2. Vincular Produto (EDT-010) — só permitido em DRAFT, condição de
    // publicação (≥1 Produto com Oferta válida).
    const linkResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/products`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ productId: product.id });

    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body.productIds).toEqual([product.id]);

    // 3. DRAFT → PENDING_REVIEW (EDT-012).
    const submitResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/submit-for-review`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.status).toBe('PENDING_REVIEW');

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('PENDING_REVIEW');

    // 4. PENDING_REVIEW → PUBLISHED (REV-003/APP-002/EDT-014).
    const firstPublishResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(firstPublishResponse.status).toBe(200);
    expect(firstPublishResponse.body.status).toBe('PUBLISHED');
    expect(firstPublishResponse.body.publishedAt).not.toBeNull();

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('PUBLISHED');
    expect(persisted.publishedAt).not.toBeNull();

    // 5. PUBLISHED → ARCHIVED (REV-004/EDT-015) — publishedAt preservado
    // (mesmo critério já provado em `archive-article.e2e-spec.ts`).
    const archiveResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/archive`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.status).toBe('ARCHIVED');

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('ARCHIVED');
    expect(persisted.publishedAt).not.toBeNull();

    // 6. ARCHIVED → DRAFT (EDT-016).
    const restoreResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/restore-to-draft`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.status).toBe('DRAFT');

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('DRAFT');

    // 7. Editar em DRAFT (EDT-009) — altera um campo real; confirma que a
    // edição persistiu E que o status continua DRAFT (não é alterado pela
    // edição em si).
    const updateResponse = await request(app!.getHttpServer())
      .patch(`/admin/sites/${site.slug}/articles/${articleId}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ title: 'Artigo do ciclo completo (editado após arquivamento)' });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe('Artigo do ciclo completo (editado após arquivamento)');
    expect(updateResponse.body.status).toBe('DRAFT');

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.title).toBe('Artigo do ciclo completo (editado após arquivamento)');
    expect(persisted.status).toBe('DRAFT');

    // 8. DRAFT → PENDING_REVIEW de novo (EDT-012).
    const secondSubmitResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/submit-for-review`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(secondSubmitResponse.status).toBe(200);
    expect(secondSubmitResponse.body.status).toBe('PENDING_REVIEW');

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('PENDING_REVIEW');

    // 9. PENDING_REVIEW → PUBLISHED de novo. Sem inventar regra nova sobre
    // `publishedAt` (a Architecture.md não define se é preservado ou
    // renovado no republish) — só o comportamento seguro já garantido pelo
    // domínio: `publishedAt` não nulo.
    const secondPublishResponse = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/articles/${articleId}/publish`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(secondPublishResponse.status).toBe(200);
    expect(secondPublishResponse.body.status).toBe('PUBLISHED');
    expect(secondPublishResponse.body.publishedAt).not.toBeNull();

    persisted = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(persisted.status).toBe('PUBLISHED');
    expect(persisted.publishedAt).not.toBeNull();
  });
});
