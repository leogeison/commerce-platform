import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Role } from '../src/generated/prisma/enums';
import type { Author, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e de Author.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt005-user@test.com';

/**
 * `DELETE /admin/sites/:siteSlug/authors/:id` (e2e, EDT-005). Exige
 * Postgres real (mesmo requisito dos demais e2e de Author).
 */
describe('DELETE /admin/sites/:siteSlug/authors/:id (e2e)', () => {
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
        name: 'Edt005 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt005-site-a',
        name: 'Edt005 Site A',
        domain: 'edt005-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt005-site-b',
        name: 'Edt005 Site B',
        domain: 'edt005-site-b.test.com',
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
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e
    // de Author. `article` antes de `author`/`site`: FK `Article.author`
    // bloquearia a exclusão de `Author`/`Site` se a ordem fosse invertida.
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt005-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'edt005-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt005-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt005-' } } });
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

  async function createAuthor(site: Site, name: string): Promise<Author> {
    return prisma.author.create({
      data: { siteId: site.id, name },
    });
  }

  /**
   * Fixture mínima de `Article` só para exercitar a FK `Article.author` —
   * nenhuma funcionalidade de Artigo além disso (EDT-006+ está fora do
   * escopo desta tarefa). Campos obrigatórios do schema Prisma sem
   * default: `type`, `title`, `slug`; `bodyMdx`/`status` usam o default do
   * schema (`''`/`DRAFT`).
   */
  async function createArticleReferencingAuthor(site: Site, author: Author): Promise<void> {
    await prisma.article.create({
      data: {
        siteId: site.id,
        authorId: author.id,
        type: ArticleType.REVIEW,
        title: 'Artigo de teste EDT-005',
        slug: 'artigo-de-teste-edt-005',
      },
    });
  }

  it('sucesso: 204 sem corpo, Author removido do banco', async () => {
    await setRole(siteA, Role.OWNER);
    const author = await createAuthor(siteA, 'Autor Removível');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted).toBeNull();
  });

  it('referenciado por Artigo: 409, Author e vínculo Article.authorId permanecem intactos', async () => {
    await setRole(siteA, Role.OWNER);
    const author = await createAuthor(siteA, 'Autor Vinculado');
    await createArticleReferencingAuthor(siteA, author);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persistedAuthor = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persistedAuthor).not.toBeNull();

    const persistedArticle = await prisma.article.findFirst({
      where: { siteId: siteA.id, authorId: author.id },
    });
    expect(persistedArticle).not.toBeNull();
    expect(persistedArticle?.authorId).toBe(author.id);
  });

  it('id inexistente no próprio Site: 404', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('id de Author real de outro Site, acessado pela URL do Site correto: 404 (isolamento), Author de outro Site permanece intacto', async () => {
    await setRole(siteA, Role.OWNER);
    const authorFromSiteB = await createAuthor(siteB, 'Do Site B');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${authorFromSiteB.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);

    const persisted = await prisma.author.findUnique({ where: { id: authorFromSiteB.id } });
    expect(persisted).not.toBeNull();
  });

  it('OWNER exclui: 204', async () => {
    await setRole(siteA, Role.OWNER);
    const author = await createAuthor(siteA, 'Autor Owner');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(204);
  });

  it('Role insuficiente (EDITOR): 403, Author permanece no banco', async () => {
    await setRole(siteA, Role.EDITOR);
    const author = await createAuthor(siteA, 'Autor Protegido');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(403);

    const persisted = await prisma.author.findUnique({ where: { id: author.id } });
    expect(persisted).not.toBeNull();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.OWNER);
    const author = await createAuthor(siteA, 'Autor Origem Inválida');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com');

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.OWNER);
    const author = await createAuthor(siteA, 'Autor Sem Sessão');

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/${author.id}`)
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(401);
  });

  it('id com formato inválido (não-UUID): 422', async () => {
    await setRole(siteA, Role.OWNER);

    const response = await request(app!.getHttpServer())
      .delete(`/admin/sites/${siteA.slug}/authors/nao-e-um-uuid`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(422);
  });
});
