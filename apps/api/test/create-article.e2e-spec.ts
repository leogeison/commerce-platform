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
import { Role } from '../src/generated/prisma/enums';
import type { Author, Category, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt006-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /admin/sites/:siteSlug/articles` (e2e, EDT-006). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto) — monta `EditorialModule`
 * real (não um controller de teste), já que `ArticlesController` é
 * produção.
 */
describe('POST /admin/sites/:siteSlug/articles (e2e)', () => {
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
        name: 'Edt006 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt006-site-a',
        name: 'Edt006 Site A',
        domain: 'edt006-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt006-site-b',
        name: 'Edt006 Site B',
        domain: 'edt006-site-b.test.com',
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
    // `article` antes de `author`/`category`/`site`: FKs de Artigo
    // bloqueariam a exclusão se a ordem fosse invertida.
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt006-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt006-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'edt006-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt006-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt006-' } } });
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

  it('sucesso mínimo (só type/title/slug): 201, corpo válido contra articleAdminSchema, status DRAFT, publishedAt null, bodyMdx vazio, categoryId/authorId null', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Artigo Mínimo', slug: 'artigo-minimo' });

    expect(response.status).toBe(201);

    const parsed = articleAdminSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(response.body.siteId).toBe(siteA.id);
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.publishedAt).toBeNull();
    expect(response.body.bodyMdx).toBe('');
    expect(response.body.categoryId).toBeNull();
    expect(response.body.authorId).toBeNull();

    const persisted = await prisma.article.findUnique({ where: { id: response.body.id } });
    expect(persisted?.bodyMdx).toBe('');
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.publishedAt).toBeNull();
  });

  it('sucesso completo (todos os campos, incluindo categoryId/authorId válidos): 201, corpo reflete todos os valores enviados', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'categoria-completa');
    const author = await createAuthor(siteA, 'Autor Completo');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'COMPARISON',
        title: 'Artigo Completo',
        slug: 'artigo-completo',
        categoryId: category.id,
        authorId: author.id,
        metaDescription: 'Descrição de teste',
        coverImageUrl: 'https://example.com/capa.jpg',
        bodyMdx: '# Conteúdo',
      });

    expect(response.status).toBe(201);
    expect(response.body.categoryId).toBe(category.id);
    expect(response.body.authorId).toBe(author.id);
    expect(response.body.metaDescription).toBe('Descrição de teste');
    expect(response.body.coverImageUrl).toBe('https://example.com/capa.jpg');
    expect(response.body.bodyMdx).toBe('# Conteúdo');
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.publishedAt).toBeNull();
  });

  it('slug duplicado no mesmo Site: 409, exatamente um Artigo persistido com esse slug', async () => {
    await setRole(siteA, Role.EDITOR);

    const first = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Primeiro Artigo', slug: 'slug-duplicado' });
    expect(first.status).toBe(201);

    const second = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Segundo Artigo', slug: 'slug-duplicado' });
    expect(second.status).toBe(409);
    expect(apiErrorSchema.safeParse(second.body).success).toBe(true);

    const persisted = await prisma.article.findMany({
      where: { siteId: siteA.id, slug: 'slug-duplicado' },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.title).toBe('Primeiro Artigo');
  });

  it('mesmo slug em dois Sites diferentes: os dois criam com sucesso (201)', async () => {
    await setRole(siteA, Role.EDITOR);
    await setRole(siteB, Role.EDITOR);

    const inSiteA = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Artigo Site A', slug: 'slug-compartilhado' });
    expect(inSiteA.status).toBe(201);

    const inSiteB = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteB.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Artigo Site B', slug: 'slug-compartilhado' });
    expect(inSiteB.status).toBe(201);

    expect(inSiteA.body.siteId).not.toBe(inSiteB.body.siteId);
  });

  it('categoryId com UUID válido mas inexistente: 422 CATEGORY_NOT_FOUND', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Categoria Inexistente',
        slug: 'artigo-categoria-inexistente',
        categoryId: NONEXISTENT_ID,
      });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('categoryId de uma Categoria real, mas de outro Site: 422 CATEGORY_NOT_FOUND (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const categoryFromSiteB = await createCategory(siteB, 'categoria-site-b');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Categoria De Outro Site',
        slug: 'artigo-categoria-de-outro-site',
        categoryId: categoryFromSiteB.id,
      });

    expect(response.status).toBe(422);
  });

  it('authorId com UUID válido mas inexistente: 422 AUTHOR_NOT_FOUND', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Autor Inexistente',
        slug: 'artigo-autor-inexistente',
        authorId: NONEXISTENT_ID,
      });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('authorId de um Autor real, mas de outro Site: 422 AUTHOR_NOT_FOUND (isolamento)', async () => {
    await setRole(siteA, Role.EDITOR);
    const authorFromSiteB = await createAuthor(siteB, 'Autor Site B');

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Autor De Outro Site',
        slug: 'artigo-autor-de-outro-site',
        authorId: authorFromSiteB.id,
      });

    expect(response.status).toBe(422);
  });

  it('Role insuficiente (VIEWER): 403', async () => {
    await setRole(siteA, Role.VIEWER);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Artigo Sem Permissão', slug: 'artigo-sem-permissao' });

    expect(response.status).toBe(403);
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ type: 'REVIEW', title: 'Artigo Origem Inválida', slug: 'artigo-origem-invalida' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW', title: 'Artigo Sem Sessão', slug: 'artigo-sem-sessao' });

    expect(response.status).toBe(401);
  });

  it('payload inválido (sem title/slug): 422', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ type: 'REVIEW' });

    expect(response.status).toBe(422);
  });

  it('status: PUBLISHED no corpo é descartado (chave desconhecida): 201, resposta e banco confirmam status DRAFT e publishedAt null', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({
        type: 'REVIEW',
        title: 'Artigo Status Ignorado',
        slug: 'artigo-status-ignorado',
        status: 'PUBLISHED',
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.publishedAt).toBeNull();

    const persisted = await prisma.article.findUnique({ where: { id: response.body.id } });
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.publishedAt).toBeNull();
  });
});
