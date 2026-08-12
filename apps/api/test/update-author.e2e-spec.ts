import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, authorAdminSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Author, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev014-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/authors/:id` (e2e, REV-014). Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (atualizar + tentar coordenar revalidação via REV-005 +
 * nunca desfazer a atualização por falha de revalidação), a semântica
 * tri-state de `userId`/`bio`/`avatarUrl`, e a regra de tenancy de `userId`
 * reproduzida exatamente de `EDT-001` (sem checagem de `SiteUser`/
 * membership) — não a chamada HTTP real de `HttpRevalidationAdapter` (já
 * coberta em `http-revalidation.adapter.spec.ts`).
 */
describe('PATCH /admin/sites/:siteSlug/authors/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let sessionUser: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;
  let revalidationPort: jest.Mocked<RevalidationPort>;
  let extraUserCounter = 0;

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

    sessionUser = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Rev014 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev014-site-a',
        name: 'Rev014 Site A',
        domain: 'rev014-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev014-site-b',
        name: 'Rev014 Site B',
        domain: 'rev014-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: sessionUser.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    // `sessionUser` pode nunca ter sido atribuído se o `beforeEach` falhar
    // antes (ex.: Postgres indisponível) — mesmo cuidado já usado nos
    // demais e2e.
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev014-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'rev014-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev014-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev014-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'rev014-' } } });
    if (sessionUser?.id) {
      await prisma.session.deleteMany({ where: { userId: sessionUser.id } });
      await prisma.user.deleteMany({ where: { id: sessionUser.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role): Promise<void> {
    await prisma.siteUser.deleteMany({ where: { userId: sessionUser!.id, siteId: site.id } });
    await prisma.siteUser.create({
      data: { userId: sessionUser!.id, siteId: site.id, role, active: true },
    });
  }

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  function patchUrl(site: Site, authorId: string): string {
    return `/admin/sites/${site.slug}/authors/${authorId}`;
  }

  async function createExtraUser(): Promise<User> {
    extraUserCounter += 1;
    return prisma.user.create({
      data: {
        email: `rev014-extra-${extraUserCounter}@test.com`,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: `Rev014 Extra ${extraUserCounter}`,
      },
    });
  }

  async function createAuthor(
    site: Site,
    overrides: Partial<{ name: string; bio: string; avatarUrl: string; userId: string | null }> = {},
  ): Promise<Author> {
    return prisma.author.create({
      data: {
        siteId: site.id,
        name: overrides.name ?? 'Autor Original',
        bio: overrides.bio ?? 'Bio original',
        avatarUrl: overrides.avatarUrl ?? 'https://example.com/original.png',
        userId: overrides.userId,
      },
    });
  }

  it('Autor convidado (sem User) → vincula User: 200, userId persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { userId: null });
    const linkedUser = await createExtraUser();

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ userId: linkedUser.id });

    expect(response.status).toBe(200);
    expect(authorAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.userId).toBe(linkedUser.id);

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.userId).toBe(linkedUser.id);
  });

  it('Autor com User → troca para outro User: 200, novo userId persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const originalUser = await createExtraUser();
    const newUser = await createExtraUser();
    const author = await createAuthor(siteA, { userId: originalUser.id });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ userId: newUser.id });

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(newUser.id);

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.userId).toBe(newUser.id);
  });

  it('Autor com User → userId: null → vira convidado: 200, userId null persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const linkedUser = await createExtraUser();
    const author = await createAuthor(siteA, { userId: linkedUser.id });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ userId: null });

    expect(response.status).toBe(200);
    expect(response.body.userId).toBeNull();

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.userId).toBeNull();
  });

  it('User já usado por outro Author do mesmo Site: 409, nenhuma persistência parcial (name também inalterado)', async () => {
    await setRole(siteA, Role.EDITOR);
    const sharedUser = await createExtraUser();
    await createAuthor(siteA, { userId: sharedUser.id, name: 'Já Vinculado' });
    const target = await createAuthor(siteA, { name: 'Nome Antigo', userId: null });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, target.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Nome Novo', userId: sharedUser.id });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.author.findUnique({ where: { id: target.id } });
    expect(persisted?.name).toBe('Nome Antigo');
    expect(persisted?.userId).toBeNull();
  });

  it('User inexistente/inválido: 422, nenhuma persistência parcial (name também inalterado)', async () => {
    await setRole(siteA, Role.EDITOR);
    const target = await createAuthor(siteA, { name: 'Nome Antigo', userId: null });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, target.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Nome Novo', userId: NONEXISTENT_ID });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.author.findUnique({ where: { id: target.id } });
    expect(persisted?.name).toBe('Nome Antigo');
    expect(persisted?.userId).toBeNull();
  });

  it('id de Author real de outro Site: 404 (isolamento), Author original inalterado', async () => {
    await setRole(siteA, Role.EDITOR);
    const authorFromSiteB = await createAuthor(siteB, { name: 'Do Site B' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, authorFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa Cross-Site' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.author.findUnique({ where: { id: authorFromSiteB.id } });
    expect(persisted?.name).toBe('Do Site B');
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Qualquer' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('PATCH parcial: só o campo enviado muda, os demais permanecem', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, {
      name: 'Nome Original',
      bio: 'Bio Original',
      avatarUrl: 'https://example.com/avatar-original.png',
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Nome Alterado' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Nome Alterado');
    expect(response.body.bio).toBe('Bio Original');
    expect(response.body.avatarUrl).toBe('https://example.com/avatar-original.png');

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.bio).toBe('Bio Original');
    expect(persisted?.avatarUrl).toBe('https://example.com/avatar-original.png');
  });

  it('PATCH vazio ({}): 200, Author devolvido sem nenhuma alteração', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { name: 'Inalterado' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Inalterado');

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.name).toBe('Inalterado');
  });

  it('bio: null limpa o campo (tri-state)', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { bio: 'Bio a remover' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ bio: null });

    expect(response.status).toBe(200);
    expect(response.body.bio).toBeNull();

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.bio).toBeNull();
  });

  it('avatarUrl: null limpa o campo (tri-state)', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { avatarUrl: 'https://example.com/a-remover.png' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ avatarUrl: null });

    expect(response.status).toBe(200);
    expect(response.body.avatarUrl).toBeNull();

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.avatarUrl).toBeNull();
  });

  it('Artigo PUBLISHED deste Author: PATCH persiste, revalidate recebe siteSlug/articleSlug corretos', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { name: 'Autora Publicada' });
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        authorId: author.id,
        title: 'Guia definitivo',
        slug: 'guia-definitivo',
        type: ArticleType.BUYING_GUIDE,
        status: ArticleStatus.PUBLISHED,
      },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Autora Atualizada' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Autora Atualizada');

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('zero Artigos afetados: revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { name: 'Sem Artigos' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Ainda Sem Artigos' });

    expect(response.status).toBe(200);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('falha de revalidação não desfaz a atualização (200, persistido, sem propagar erro)', async () => {
    await setRole(siteA, Role.EDITOR);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const author = await createAuthor(siteA, { name: 'Antes da Falha' });
    await prisma.article.create({
      data: {
        siteId: siteA.id,
        authorId: author.id,
        title: 'Artigo Vinculado',
        slug: 'artigo-vinculado',
        type: ArticleType.BUYING_GUIDE,
        status: ArticleStatus.PUBLISHED,
      },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Depois da Falha' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Depois da Falha');

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.name).toBe('Depois da Falha');
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('Role insuficiente (VIEWER): 403, nada persistido', async () => {
    await setRole(siteA, Role.VIEWER);
    const author = await createAuthor(siteA, { name: 'Protegido' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa Sem Permissão' });

    expect(response.status).toBe(403);

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted?.name).toBe('Protegido');
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { name: 'Origin Inválida' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, { name: 'Sem Sessão' });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, author.id))
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(401);
  });
});
