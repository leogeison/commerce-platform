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
import type { Article, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'edt018-user@test.com';

/**
 * EDT-015 (`PUBLISHED → ARCHIVED`) é uma operação INTERNA
 * (Implementation-Backlog.md, EDT-012 a EDT-016): a única forma de
 * arquivar é `POST /archive → REV-004 → EDT-015 → REV-002`, orquestrada
 * apenas quando REV-004 existir. `ArticlesController` nunca registrou uma
 * rota `archive`, então este teste fecha literalmente o critério de
 * EDT-012 a EDT-016 ("teste garantindo que EDT-015 não é alcançável via
 * rota HTTP direta"), exigido como parte do marco EDT-018.
 *
 * A operação irmã, EDT-014 (`mark-as-published`), tinha o mesmo teste
 * aqui; ele foi removido porque deixou de ser verdade — `POST /publish`
 * agora existe (REV-003, `publish-article.e2e-spec.ts`), que prova o
 * caminho HTTP correto e único até EDT-014.
 *
 * Sessão válida, membership válida (`OWNER`, a Role mais alta), Origin
 * válida e Artigo em status compatível com a operação que a rota
 * *teria* realizado se existisse (`PUBLISHED` para "archive") — tudo
 * isso elimina qualquer explicação alternativa para o `404`: ele só pode
 * vir da ausência da rota em si (`Cannot POST ...`), nunca de
 * autenticação, autorização, Origin ou status de origem. Exige Postgres
 * real (mesmo requisito dos demais e2e do projeto).
 */
describe('Operação interna EDT-015 não exposta via HTTP direta (e2e, dedicado — EDT-018)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
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
        name: 'Edt018 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'edt018-site-a',
        name: 'Edt018 Site A',
        domain: 'edt018-site-a.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: siteA.id, role: Role.OWNER, active: true },
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
      where: { site: { slug: { startsWith: 'edt018-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'edt018-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt018-' } } });
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

  async function createArticle(slug: string, status: ArticleStatus): Promise<Article> {
    return prisma.article.create({
      data: { siteId: siteA.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW, status },
    });
  }

  it('POST /articles/:id/archive com Artigo em PUBLISHED: 404 (rota inexistente)', async () => {
    const article = await createArticle('artigo-archive-inexistente', ArticleStatus.PUBLISHED);

    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${siteA.slug}/articles/${article.id}/archive`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(404);

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });
});
