import { Test, TestingModule } from '@nestjs/testing';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { MarkArticleAsPublishedUseCase } from '../src/modules/editorial/application/mark-article-as-published.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType } from '../src/generated/prisma/enums';
import type { Article, Site } from '../src/generated/prisma/client';

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `MarkArticleAsPublishedUseCase` (integração, EDT-014) — operação
 * INTERNA, sem rota HTTP própria (Architecture.md: "nenhuma operação
 * interna de publicação ou arquivamento tem controller HTTP próprio"), então
 * este teste não usa `supertest`/`request()` como os demais e2e do
 * projeto: resolve o caso de uso pelo `TestingModule` (mesmo `EditorialModule`
 * que o registra e o exporta) e chama `execute()` diretamente — valida
 * provider, injeção e persistência real contra o Postgres, sem precisar
 * de uma rota inexistente para chegar até ele. Exige Postgres real (mesmo
 * requisito dos demais e2e do projeto).
 */
describe('MarkArticleAsPublishedUseCase (integração, EDT-014)', () => {
  let moduleFixture: TestingModule | undefined;
  let prisma: PrismaService;
  let useCase: MarkArticleAsPublishedUseCase;
  let siteA: Site;
  let siteB: Site;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    useCase = moduleFixture.get(MarkArticleAsPublishedUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'edt014-site-a',
        name: 'Edt014 Site A',
        domain: 'edt014-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'edt014-site-b',
        name: 'Edt014 Site B',
        domain: 'edt014-site-b.test.com',
        locale: 'pt-BR',
      },
    });
  });

  afterEach(async () => {
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'edt014-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'edt014-' } } });

    if (moduleFixture) {
      await moduleFixture.close();
      moduleFixture = undefined;
    }
  });

  async function createArticle(
    site: Site,
    slug: string,
    status: ArticleStatus,
  ): Promise<Article> {
    return prisma.article.create({
      data: { siteId: site.id, title: `Artigo ${slug}`, slug, type: ArticleType.REVIEW, status },
    });
  }

  it('PENDING_REVIEW → PUBLISHED: grava status e publishedAt na mesma operação', async () => {
    const article = await createArticle(
      siteA,
      'artigo-publicar-sucesso',
      ArticleStatus.PENDING_REVIEW,
    );
    const before = new Date();

    const result = await useCase.execute({ siteId: siteA.id, id: article.id });

    expect(result.ok).toBe(true);
    expect(result.ok && result.article.status).toBe('PUBLISHED');
    expect(result.ok && result.article.publishedAt).not.toBeNull();
    expect(result.ok && result.article.publishedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );

    const persisted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(persisted?.status).toBe('PUBLISHED');
    expect(persisted?.publishedAt).not.toBeNull();
  });

  it.each([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED])(
    'status de origem inválido (%s): WRONG_STATUS, status e publishedAt não mudam',
    async (status) => {
      const article = await createArticle(
        siteA,
        `artigo-publicar-invalido-${status.toLowerCase()}`,
        status,
      );

      const result = await useCase.execute({ siteId: siteA.id, id: article.id });

      expect(result).toEqual({ ok: false, reason: 'WRONG_STATUS' });

      const persisted = await prisma.article.findUnique({ where: { id: article.id } });
      expect(persisted?.status).toBe(status);
      expect(persisted?.publishedAt).toBeNull();
    },
  );

  it('articleId inexistente no próprio Site: NOT_FOUND', async () => {
    const result = await useCase.execute({ siteId: siteA.id, id: NONEXISTENT_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('articleId de um Artigo real de outro Site: NOT_FOUND (isolamento), nada muda', async () => {
    const articleFromSiteB = await createArticle(
      siteB,
      'artigo-site-b',
      ArticleStatus.PENDING_REVIEW,
    );

    const result = await useCase.execute({ siteId: siteA.id, id: articleFromSiteB.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const persisted = await prisma.article.findUnique({ where: { id: articleFromSiteB.id } });
    expect(persisted?.status).toBe('PENDING_REVIEW');
    expect(persisted?.publishedAt).toBeNull();
  });
});
