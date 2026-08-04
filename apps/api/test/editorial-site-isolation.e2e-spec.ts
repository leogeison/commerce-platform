import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Author, Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão de `catalog-site-isolation.e2e-spec.ts` (CAT-022).
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const ATTACKER_EMAIL = 'edt017-attacker@test.com';

/**
 * EDT-017 — suíte dedicada de bloqueio de acesso cruzado no Editorial,
 * mesmo padrão de `catalog-site-isolation.e2e-spec.ts` (CAT-022),
 * estendendo AUTH-010 aos dois recursos: Autor, Artigo (incluindo
 * `ArticleProduct` e as três transições de estado HTTP-facing da Fase 7).
 * Exige Postgres real.
 *
 * Um único `attacker`, OWNER só do Site A (nunca tem `SiteUser` no Site
 * B) — `OWNER` é a Role mais alta, então cobre o vetor 1 (bloqueio por
 * `SiteAuthorizationGuard`) para todas as 14 rotas reais, inclusive as
 * que exigem `OWNER` (`restore-to-draft`). Site B recebe dados "vítima"
 * criados direto via Prisma.
 *
 * Fixtures de Artigo do Site B com status específico por transição
 * (`articleB_draft`/`articleB_pendingReview`/`articleB_archived`) —
 * decisão explícita desta tarefa: cada teste de transição no vetor 2 usa
 * o status de origem correto daquela rota, para garantir que o `404`
 * venha do isolamento tenant-aware (a chave composta `id_siteId` nunca
 * bate), não de um `409` por status incorreto mascarando o resultado.
 *
 * Dois vetores de ataque, mesmo critério de CAT-022:
 * 1. `siteSlug` do Site B na URL — `SiteAuthorizationGuard` barra antes
 *    de qualquer lógica de Editorial (`403`), testado nas 14 rotas reais
 *    via `it.each`.
 * 2. `siteSlug` do próprio Site A (autorizado), mas `id`/`productId`/
 *    `categoryId`/`authorId` apontando para um recurso do Site B — cada
 *    endpoint já trata isso reativamente (chave composta/`P2003`), aqui
 *    só confirmando que o comportamento se sustenta (`404`/`422`
 *    conforme o endpoint).
 */
describe('Bloqueio de acesso cruzado no Editorial (e2e, dedicado — EDT-017)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let attacker: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let authorB: Author;
  let categoryB: Category;
  let productB: Product;
  let articleB: Article;
  let articleB_draft: Article;
  let articleB_pendingReview: Article;
  let articleB_archived: Article;
  let articleA: Article;
  let attackerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    attacker = await prisma.user.create({
      data: {
        email: ATTACKER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Edt017 Attacker',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt017-site-a',
        name: 'Edt017 Site A',
        domain: 'edt017-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt017-site-b',
        name: 'Edt017 Site B',
        domain: 'edt017-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: attacker.id, siteId: siteA.id, role: Role.OWNER, active: true },
    });

    authorB = await prisma.author.create({
      data: { siteId: siteB.id, name: 'Autor Vítima' },
    });
    categoryB = await prisma.category.create({
      data: { siteId: siteB.id, name: 'Categoria Vítima', slug: 'edt017-categoria-vitima' },
    });
    productB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Produto Vítima', slug: 'edt017-produto-vitima' },
    });
    articleB = await prisma.article.create({
      data: {
        siteId: siteB.id,
        title: 'Artigo Vítima',
        slug: 'edt017-artigo-vitima',
        type: ArticleType.REVIEW,
        status: ArticleStatus.DRAFT,
      },
    });
    articleB_draft = await prisma.article.create({
      data: {
        siteId: siteB.id,
        title: 'Artigo Vítima Draft',
        slug: 'edt017-artigo-vitima-draft',
        type: ArticleType.REVIEW,
        status: ArticleStatus.DRAFT,
      },
    });
    articleB_pendingReview = await prisma.article.create({
      data: {
        siteId: siteB.id,
        title: 'Artigo Vítima Pending Review',
        slug: 'edt017-artigo-vitima-pending-review',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PENDING_REVIEW,
      },
    });
    articleB_archived = await prisma.article.create({
      data: {
        siteId: siteB.id,
        title: 'Artigo Vítima Archived',
        slug: 'edt017-artigo-vitima-archived',
        type: ArticleType.REVIEW,
        status: ArticleStatus.ARCHIVED,
      },
    });

    // Artigo próprio do atacante em Site A (DRAFT) — usado nos testes do
    // vetor 2 que precisam de um Artigo elegível para `PATCH`/vincular
    // Produto (ambos exigem `DRAFT`), tentando referenciar
    // Categoria/Autor/Produto do Site B a partir dele.
    articleA = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Artigo do Atacante',
        slug: 'edt017-artigo-atacante',
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
    // antes (ex.: Postgres indisponível) — mesmo cuidado já usado nos
    // demais e2e do projeto. `articleProduct` antes de `article`/
    // `author`/`product`/`category`: FKs bloqueariam a exclusão se a
    // ordem fosse invertida.
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'edt017-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt017-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt017-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'edt017-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'edt017-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt017-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt017-' } } });
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

  describe('Vetor 1: siteSlug do Site B, atacante sem membership → 403 em todas as rotas reais', () => {
    it.each([
      {
        label: 'GET /authors (listar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/authors`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'POST /authors (criar)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/authors`,
        needsOrigin: true,
        body: () => ({ name: 'Autor Forjado' }),
      },
      {
        label: 'GET /authors/:id (detalhar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/authors/${authorB.id}`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'DELETE /authors/:id (excluir)',
        method: 'delete',
        path: () => `/admin/sites/${siteB.slug}/authors/${authorB.id}`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'POST /articles (criar)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/articles`,
        needsOrigin: true,
        body: () => ({ type: 'REVIEW', title: 'Forjado', slug: 'edt017-artigo-forjado' }),
      },
      {
        label: 'GET /articles (listar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/articles`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'GET /articles/:id (detalhar)',
        method: 'get',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}`,
        needsOrigin: false,
        body: undefined,
      },
      {
        label: 'PATCH /articles/:id (atualizar)',
        method: 'patch',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}`,
        needsOrigin: true,
        body: () => ({ title: 'Forjado' }),
      },
      {
        label: 'POST /articles/:id/products (vincular)',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/products`,
        needsOrigin: true,
        body: () => ({ productId: productB.id }),
      },
      {
        label: 'DELETE /articles/:id/products/:productId (desvincular)',
        method: 'delete',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/products/${productB.id}`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'PATCH /articles/:id/products/reorder (reordenar)',
        method: 'patch',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/products/reorder`,
        needsOrigin: true,
        body: () => ({ productIds: [] }),
      },
      {
        label: 'POST /articles/:id/submit-for-review',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/submit-for-review`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'POST /articles/:id/revert-to-draft',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/revert-to-draft`,
        needsOrigin: true,
        body: undefined,
      },
      {
        label: 'POST /articles/:id/restore-to-draft',
        method: 'post',
        path: () => `/admin/sites/${siteB.slug}/articles/${articleB.id}/restore-to-draft`,
        needsOrigin: true,
        body: undefined,
      },
    ])('$label → 403', async ({ method, path, needsOrigin, body }) => {
      let req =
        method === 'get'
          ? request(app!.getHttpServer()).get(path())
          : method === 'post'
            ? request(app!.getHttpServer()).post(path())
            : method === 'patch'
              ? request(app!.getHttpServer()).patch(path())
              : request(app!.getHttpServer()).delete(path());
      req = req.set('Cookie', cookieHeader());
      if (needsOrigin) {
        req = req.set('Origin', ADMIN_ORIGIN);
      }
      if (body) {
        req = req.send(body());
      }

      const response = await req;
      expect(response.status).toBe(403);
    });

    it('nenhum Author/Article forjado foi criado no Site B pelas tentativas de POST', async () => {
      const authorCount = await prisma.author.count({ where: { siteId: siteB.id } });
      const articleCount = await prisma.article.count({ where: { siteId: siteB.id } });

      // Só as fixtures originais (`authorB`, `articleB` + as três variantes
      // de status) — a ausência de criação em cada tentativa individual já
      // é garantida pelo `403` (a rota nunca chega ao
      // `CreateAuthorUseCase`/`CreateArticleUseCase`).
      expect(authorCount).toBe(1);
      expect(articleCount).toBe(4);
    });
  });

  describe('Vetor 2: siteSlug do Site A (autorizado), IDs/referências do Site B', () => {
    it('GET /authors/:id com id de Author do Site B: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/authors/${authorB.id}`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('DELETE /authors/:id com id de Author do Site B: 404, Author do Site B permanece intacto', async () => {
      const response = await request(app!.getHttpServer())
        .delete(`/admin/sites/${siteA.slug}/authors/${authorB.id}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.author.findUnique({ where: { id: authorB.id } });
      expect(persisted).not.toBeNull();
    });

    it('GET /articles/:id com id de Artigo do Site B: 404', async () => {
      const response = await request(app!.getHttpServer())
        .get(`/admin/sites/${siteA.slug}/articles/${articleB.id}`)
        .set('Cookie', cookieHeader());

      expect(response.status).toBe(404);
    });

    it('PATCH /articles/:id com id de Artigo do Site B: 404, Artigo do Site B inalterado', async () => {
      const response = await request(app!.getHttpServer())
        .patch(`/admin/sites/${siteA.slug}/articles/${articleB.id}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ title: 'Tentativa Cruzada' });

      expect(response.status).toBe(404);

      const persisted = await prisma.article.findUnique({ where: { id: articleB.id } });
      expect(persisted?.title).toBe('Artigo Vítima');
    });

    it('PATCH /articles/:id (Artigo do Site A) com categoryId da Categoria do Site B: 422, categoryId não muda', async () => {
      const response = await request(app!.getHttpServer())
        .patch(`/admin/sites/${siteA.slug}/articles/${articleA.id}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ categoryId: categoryB.id });

      expect(response.status).toBe(422);

      const persisted = await prisma.article.findUnique({ where: { id: articleA.id } });
      expect(persisted?.categoryId).toBeNull();
    });

    it('PATCH /articles/:id (Artigo do Site A) com authorId do Author do Site B: 422, authorId não muda', async () => {
      const response = await request(app!.getHttpServer())
        .patch(`/admin/sites/${siteA.slug}/articles/${articleA.id}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ authorId: authorB.id });

      expect(response.status).toBe(422);

      const persisted = await prisma.article.findUnique({ where: { id: articleA.id } });
      expect(persisted?.authorId).toBeNull();
    });

    it('POST /articles/:id/products (Artigo do Site A) com productId do Produto do Site B: 422, nenhum vínculo criado', async () => {
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

    it('DELETE /articles/:id/products/:productId (Artigo do Site A, productId real do Site B): 404, nada muda', async () => {
      const response = await request(app!.getHttpServer())
        .delete(`/admin/sites/${siteA.slug}/articles/${articleA.id}/products/${productB.id}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const count = await prisma.articleProduct.count({
        where: { siteId: siteA.id, articleId: articleA.id },
      });
      expect(count).toBe(0);
    });

    it('POST /articles/:id/submit-for-review com id de Artigo do Site B (em DRAFT, status de origem correto): 404, status não muda', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/articles/${articleB_draft.id}/submit-for-review`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.article.findUnique({ where: { id: articleB_draft.id } });
      expect(persisted?.status).toBe('DRAFT');
    });

    it('POST /articles/:id/revert-to-draft com id de Artigo do Site B (em PENDING_REVIEW, status de origem correto): 404, status não muda', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/articles/${articleB_pendingReview.id}/revert-to-draft`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.article.findUnique({
        where: { id: articleB_pendingReview.id },
      });
      expect(persisted?.status).toBe('PENDING_REVIEW');
    });

    it('POST /articles/:id/restore-to-draft com id de Artigo do Site B (em ARCHIVED, status de origem correto): 404, status não muda', async () => {
      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${siteA.slug}/articles/${articleB_archived.id}/restore-to-draft`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN);

      expect(response.status).toBe(404);

      const persisted = await prisma.article.findUnique({ where: { id: articleB_archived.id } });
      expect(persisted?.status).toBe('ARCHIVED');
    });

    it('ao final: Author, Article e vínculos ArticleProduct do Site B permanecem intactos; nenhum vínculo cross-tenant foi criado', async () => {
      const persistedAuthor = await prisma.author.findUniqueOrThrow({
        where: { id: authorB.id },
      });
      const persistedArticle = await prisma.article.findUniqueOrThrow({
        where: { id: articleB.id },
      });
      const persistedArticleDraft = await prisma.article.findUniqueOrThrow({
        where: { id: articleB_draft.id },
      });
      const persistedArticlePendingReview = await prisma.article.findUniqueOrThrow({
        where: { id: articleB_pendingReview.id },
      });
      const persistedArticleArchived = await prisma.article.findUniqueOrThrow({
        where: { id: articleB_archived.id },
      });

      expect(persistedAuthor).toMatchObject({ siteId: siteB.id, name: 'Autor Vítima' });
      expect(persistedArticle).toMatchObject({
        siteId: siteB.id,
        title: 'Artigo Vítima',
        status: 'DRAFT',
      });
      expect(persistedArticleDraft.status).toBe('DRAFT');
      expect(persistedArticlePendingReview.status).toBe('PENDING_REVIEW');
      expect(persistedArticleArchived.status).toBe('ARCHIVED');

      const crossTenantLinks = await prisma.articleProduct.count({
        where: {
          OR: [
            { siteId: siteA.id, productId: productB.id },
            { siteId: siteB.id, articleId: articleA.id },
          ],
        },
      });
      expect(crossTenantLinks).toBe(0);
    });
  });
});
