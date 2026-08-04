import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, articleAdminSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Article, Author, Category, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt009-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/articles/:id` (e2e, EDT-009). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto).
 */
describe('PATCH /admin/sites/:siteSlug/articles/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Edt009 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt009-site-a',
        name: 'Edt009 Site A',
        domain: 'edt009-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt009-site-b',
        name: 'Edt009 Site B',
        domain: 'edt009-site-b.test.com',
        locale: 'pt-BR',
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
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt009-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt009-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'edt009-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt009-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt009-' } } });
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

  async function createCategory(site: Site, slug: string): Promise<Category> {
    return prisma.category.create({
      data: { siteId: site.id, name: `Categoria ${slug}`, slug },
    });
  }

  async function createAuthor(site: Site, name: string): Promise<Author> {
    return prisma.author.create({ data: { siteId: site.id, name } });
  }

  async function createArticle(
    site: Site,
    slug: string,
    overrides: Partial<{
      status: ArticleStatus;
      categoryId: string;
      authorId: string;
      metaDescription: string;
      coverImageUrl: string;
    }> = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status: overrides.status ?? ArticleStatus.DRAFT,
        categoryId: overrides.categoryId,
        authorId: overrides.authorId,
        metaDescription: overrides.metaDescription,
        coverImageUrl: overrides.coverImageUrl,
      },
    });
  }

  function patch(site: Site, id: string) {
    return request(app!.getHttpServer())
      .patch(`/admin/sites/${site.slug}/articles/${id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);
  }

  it('sucesso parcial (só title): 200, título atualizado, demais campos intactos', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-parcial', {
      metaDescription: 'Descrição original',
    });

    const response = await patch(siteA, article.id).send({ title: 'Título Atualizado' });

    expect(response.status).toBe(200);
    expect(articleAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.title).toBe('Título Atualizado');
    expect(response.body.slug).toBe('artigo-parcial');
    expect(response.body.metaDescription).toBe('Descrição original');
  });

  it('sucesso limpando categoryId (null explícito): 200, categoryId volta a null', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'categoria-a-limpar');
    const article = await createArticle(siteA, 'artigo-limpa-categoria', {
      categoryId: category.id,
    });

    const response = await patch(siteA, article.id).send({ categoryId: null });

    expect(response.status).toBe(200);
    expect(response.body.categoryId).toBeNull();

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.categoryId).toBeNull();
  });

  it('sucesso limpando um campo escalar nullable (metaDescription: null): 200, campo volta a null, demais campos intactos', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-limpa-meta', {
      metaDescription: 'Descrição a ser limpa',
    });

    const response = await patch(siteA, article.id).send({ metaDescription: null });

    expect(response.status).toBe(200);
    expect(response.body.metaDescription).toBeNull();
    expect(response.body.title).toBe('Artigo artigo-limpa-meta');

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.metaDescription).toBeNull();
  });

  it('sucesso com todos os campos: 200, corpo reflete todos os valores enviados', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'categoria-completa');
    const author = await createAuthor(siteA, 'Autor Completo');
    const article = await createArticle(siteA, 'artigo-completo-original');

    const response = await patch(siteA, article.id).send({
      type: 'COMPARISON',
      title: 'Artigo Totalmente Atualizado',
      slug: 'artigo-completo-atualizado',
      categoryId: category.id,
      authorId: author.id,
      metaDescription: 'Nova descrição',
      coverImageUrl: 'https://example.com/nova-capa.jpg',
      bodyMdx: '# Novo conteúdo',
    });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('COMPARISON');
    expect(response.body.title).toBe('Artigo Totalmente Atualizado');
    expect(response.body.slug).toBe('artigo-completo-atualizado');
    expect(response.body.categoryId).toBe(category.id);
    expect(response.body.authorId).toBe(author.id);
    expect(response.body.metaDescription).toBe('Nova descrição');
    expect(response.body.coverImageUrl).toBe('https://example.com/nova-capa.jpg');
    expect(response.body.bodyMdx).toBe('# Novo conteúdo');
  });

  it('PATCH vazio ({}) em Artigo DRAFT: 200, sem mudanças', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-patch-vazio');

    const response = await patch(siteA, article.id).send({});

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Artigo artigo-patch-vazio');
    expect(response.body.slug).toBe('artigo-patch-vazio');
  });

  it('PATCH vazio ({}) em Artigo fora de DRAFT: 409', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-patch-vazio-nao-draft', {
      status: ArticleStatus.PUBLISHED,
    });

    const response = await patch(siteA, article.id).send({});

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it.each([ArticleStatus.PENDING_REVIEW, ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])(
    'bloqueio fora de DRAFT (status %s): 409, Artigo permanece intacto',
    async (status) => {
      await setRole(siteA, Role.EDITOR);
      const article = await createArticle(siteA, `artigo-bloqueado-${status.toLowerCase()}`, {
        status,
      });

      const response = await patch(siteA, article.id).send({ title: 'Tentativa de Edição' });

      expect(response.status).toBe(409);
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

      const persisted = await prisma.article.findUnique({ where: { id: article.id } });
      expect(persisted?.title).not.toBe('Tentativa de Edição');
      expect(persisted?.status).toBe(status);
    },
  );

  it('slug duplicado no mesmo Site: 409, Artigo original permanece com o slug antigo', async () => {
    await setRole(siteA, Role.EDITOR);
    await createArticle(siteA, 'slug-ja-existente');
    const article = await createArticle(siteA, 'artigo-a-renomear');

    const response = await patch(siteA, article.id).send({ slug: 'slug-ja-existente' });

    expect(response.status).toBe(409);

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.slug).toBe('artigo-a-renomear');
  });

  it('categoryId com UUID válido mas inexistente: 422 CATEGORY_NOT_FOUND', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-categoria-inexistente');

    const response = await patch(siteA, article.id).send({ categoryId: NONEXISTENT_ID });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('categoryId de uma Categoria real, mas de outro Site: 422 CATEGORY_NOT_FOUND (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const categoryFromSiteB = await createCategory(siteB, 'categoria-site-b');
    const article = await createArticle(siteA, 'artigo-categoria-outro-site');

    const response = await patch(siteA, article.id).send({ categoryId: categoryFromSiteB.id });

    expect(response.status).toBe(422);
  });

  it('authorId com UUID válido mas inexistente: 422 AUTHOR_NOT_FOUND', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-autor-inexistente');

    const response = await patch(siteA, article.id).send({ authorId: NONEXISTENT_ID });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('authorId de um Autor real, mas de outro Site: 422 AUTHOR_NOT_FOUND (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const authorFromSiteB = await createAuthor(siteB, 'Autor Site B');
    const article = await createArticle(siteA, 'artigo-autor-outro-site');

    const response = await patch(siteA, article.id).send({ authorId: authorFromSiteB.id });

    expect(response.status).toBe(422);
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await patch(siteA, NONEXISTENT_ID).send({ title: 'Não Importa' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Artigo real de outro Site, acessado pela URL do Site correto: 404 (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const articleFromSiteB = await createArticle(siteB, 'artigo-site-b');

    const response = await patch(siteA, articleFromSiteB.id).send({ title: 'Não Importa' });

    expect(response.status).toBe(404);

    const persisted = await prisma.article.findUnique({ where: { id: articleFromSiteB.id } });
    expect(persisted?.title).toBe('Artigo artigo-site-b');
  });

  it('Role insuficiente (VIEWER): 403, Artigo permanece intacto', async () => {
    await setRole(siteA, Role.VIEWER);
    const article = await createArticle(siteA, 'artigo-role-insuficiente');

    const response = await patch(siteA, article.id).send({ title: 'Tentativa Sem Permissão' });

    expect(response.status).toBe(403);

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.title).not.toBe('Tentativa Sem Permissão');
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-origem-invalida');

    const response = await request(app!.getHttpServer())
      .patch(`/admin/sites/${siteA.slug}/articles/${article.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ title: 'Tentativa' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const article = await createArticle(siteA, 'artigo-sem-sessao');

    const response = await request(app!.getHttpServer())
      .patch(`/admin/sites/${siteA.slug}/articles/${article.id}`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ title: 'Tentativa' });

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await patch(siteA, 'nao-e-um-uuid').send({ title: 'Tentativa' });

    expect(response.status).toBe(422);
  });
});
