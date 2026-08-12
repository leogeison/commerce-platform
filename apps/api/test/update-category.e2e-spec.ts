import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, categoryAdminSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Category, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev009-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/categories/:id` (e2e). Exige Postgres real
 * (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (atualizar + tentar coordenar revalidação via REV-005 +
 * nunca desfazer a atualização por falha de revalidação), não a chamada
 * HTTP real de `HttpRevalidationAdapter` (já coberta em
 * `http-revalidation.adapter.spec.ts`).
 */
describe('PATCH /admin/sites/:siteSlug/categories/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
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
        name: 'Rev009 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev009-site-a',
        name: 'Rev009 Site A',
        domain: 'rev009-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev009-site-b',
        name: 'Rev009 Site B',
        domain: 'rev009-site-b.test.com',
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
      where: { site: { slug: { startsWith: 'rev009-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'rev009-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev009-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev009-' } } });
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

  function patchUrl(site: Site, categoryId: string): string {
    return `/admin/sites/${site.slug}/categories/${categoryId}`;
  }

  async function createCategory(
    site: Site,
    name: string,
    slug: string,
    archived = false,
  ): Promise<Category> {
    return prisma.category.create({
      data: {
        siteId: site.id,
        name,
        slug,
        archivedAt: archived ? new Date() : null,
      },
    });
  }

  it('EDITOR atualiza Categoria sem Artigo afetado: 200, persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Eletrônicos', 'eletronicos');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Eletrônicos e Acessórios', slug: 'eletronicos-e-acessorios' });

    expect(response.status).toBe(200);
    expect(categoryAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.name).toBe('Eletrônicos e Acessórios');
    expect(response.body.slug).toBe('eletronicos-e-acessorios');

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.name).toBe('Eletrônicos e Acessórios');
    expect(persisted?.slug).toBe('eletronicos-e-acessorios');

    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Artigo PUBLISHED referencia a Categoria: PATCH altera name/slug da Categoria, persiste, e REV-005/APP-005 encontra o Artigo por categoryId — revalidate recebe siteSlug do Site e articleSlug do Artigo', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Fones', 'fones');
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        categoryId: category.id,
        title: 'Melhor fone bluetooth',
        slug: 'melhor-fone-bluetooth',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Fones de Ouvido', slug: 'fones-de-ouvido' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Fones de Ouvido');
    expect(response.body.slug).toBe('fones-de-ouvido');

    const persistedCategory = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persistedCategory?.slug).toBe('fones-de-ouvido');

    // `categoryId` do Artigo nunca muda ao renomear a Categoria — a
    // travessia de APP-005 continua encontrando o mesmo Artigo.
    const persistedArticle = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persistedArticle?.categoryId).toBe(category.id);

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('id inexistente no próprio Site: 404, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Não existe' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('id de Categoria real de outro Site: 404 (isolamento), revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const categoryFromSiteB = await createCategory(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, categoryFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa cross-site' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.category.findUnique({ where: { id: categoryFromSiteB.id } });
    expect(persisted?.name).toBe('Do Site B');
  });

  it('slug conflitante com outra Categoria do mesmo Site: 409, nada persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    await createCategory(siteA, 'Casa', 'casa');
    const category = await createCategory(siteA, 'Jardim', 'jardim');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ slug: 'casa' });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.slug).toBe('jardim');
  });

  it('PATCH vazio ({}): 200, Categoria devolvida sem alteração de name/slug', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Esportes', 'esportes');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Esportes');
    expect(response.body.slug).toBe('esportes');

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.name).toBe('Esportes');
    expect(persisted?.slug).toBe('esportes');
  });

  it('Categoria arquivada continua editável: 200, name/slug atualizados, archivedAt preservado (comparado explicitamente antes/depois)', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Livros', 'livros', true);
    const archivedAtBefore = category.archivedAt;
    expect(archivedAtBefore).not.toBeNull();

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Livros e Revistas' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Livros e Revistas');

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.name).toBe('Livros e Revistas');
    expect(persisted?.archivedAt?.toISOString()).toBe(archivedAtBefore!.toISOString());
  });

  it('falha de revalidação não desfaz a atualização (200, persistido, sem propagar erro)', async () => {
    await setRole(siteA, Role.EDITOR);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const category = await createCategory(siteA, 'Beleza', 'beleza');
    await prisma.article.create({
      data: {
        siteId: siteA.id,
        categoryId: category.id,
        title: 'Artigo de beleza',
        slug: 'artigo-de-beleza',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Beleza e Cuidados' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Beleza e Cuidados');

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.name).toBe('Beleza e Cuidados');
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('Role insuficiente (VIEWER): 403, nada persistido', async () => {
    await setRole(siteA, Role.VIEWER);
    const category = await createCategory(siteA, 'Games', 'games');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa sem permissão' });

    expect(response.status).toBe(403);

    const persisted = await prisma.category.findUnique({ where: { id: category.id } });
    expect(persisted?.name).toBe('Games');
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Automotivo', 'automotivo');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Pet', 'pet');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, category.id))
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(401);
  });
});
