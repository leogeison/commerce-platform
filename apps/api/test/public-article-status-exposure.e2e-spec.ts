import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType } from '../src/generated/prisma/enums';
import type { Article, Category, Site } from '../src/generated/prisma/client';

/**
 * PUB-006 — suíte dedicada de garantia de não exposição de Artigo
 * `DRAFT`/`PENDING_REVIEW`/`ARCHIVED` pela API pública, no mesmo espírito
 * de `tracking-site-isolation.e2e-spec.ts` (TRK-008)/`catalog-site-isolation.e2e-spec.ts`
 * (CAT-022): um arquivo próprio que consolida a garantia num único lugar
 * auditável, complementando — nunca substituindo — a cobertura já
 * existente e espalhada em `public-articles.e2e-spec.ts` (PUB-002,
 * `'só Artigos PUBLISHED aparecem...'`) e `get-public-article.e2e-spec.ts`
 * (PUB-003, `'404: slug existe, mas em DRAFT/PENDING_REVIEW/ARCHIVED'`),
 * que seguem intactas. Exige Postgres real (mesmo requisito dos demais e2e
 * do projeto).
 *
 * `Category` fica fora desta suíte de propósito: `DRAFT`/`PENDING_REVIEW`/
 * `ARCHIVED` são estados de `ArticleStatus`, que `Category` não tem — ela
 * só tem `archivedAt`, e a PUB-004 já decidiu explicitamente que Categoria
 * arquivada continua resolvível (`200`) pela API pública. Aplicar este
 * critério a `Category` contradiria aquela decisão; não alterada aqui.
 */
describe('Não exposição de Artigo DRAFT/PENDING_REVIEW/ARCHIVED pela API pública (e2e, dedicado — PUB-006)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let site: Site;
  let category: Category;
  let draft: Article;
  let pendingReview: Article;
  let published: Article;
  let archived: Article;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    site = await prisma.site.create({
      data: {
        slug: 'pub006-site',
        name: 'Pub006 Site',
        domain: 'pub006-site.test.com',
        locale: 'pt-BR',
      },
    });
    category = await prisma.category.create({
      data: { siteId: site.id, name: 'Categoria Pub006', slug: 'categoria-pub006' },
    });

    draft = await prisma.article.create({
      data: {
        siteId: site.id,
        title: 'Artigo Pub006 Draft',
        slug: 'pub006-draft',
        type: ArticleType.REVIEW,
        status: 'DRAFT',
        categoryId: category.id,
      },
    });
    pendingReview = await prisma.article.create({
      data: {
        siteId: site.id,
        title: 'Artigo Pub006 Pending Review',
        slug: 'pub006-pending-review',
        type: ArticleType.REVIEW,
        status: 'PENDING_REVIEW',
        categoryId: category.id,
      },
    });
    published = await prisma.article.create({
      data: {
        siteId: site.id,
        title: 'Artigo Pub006 Published',
        slug: 'pub006-published',
        type: ArticleType.REVIEW,
        status: 'PUBLISHED',
        categoryId: category.id,
        publishedAt: new Date(),
      },
    });
    archived = await prisma.article.create({
      data: {
        siteId: site.id,
        title: 'Artigo Pub006 Archived',
        slug: 'pub006-archived',
        type: ArticleType.REVIEW,
        status: 'ARCHIVED',
        categoryId: category.id,
      },
    });
  });

  afterEach(async () => {
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'pub006-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'pub006-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'pub006-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('listagem: só o Artigo PUBLISHED aparece em items, total = 1, sem nenhum filtro de query', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${site.slug}/articles`,
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(published.id);
    expect(response.body.items[0].slug).toBe(published.slug);

    const exposedIds = response.body.items.map((item: { id: string }) => item.id);
    expect(exposedIds).not.toContain(draft.id);
    expect(exposedIds).not.toContain(pendingReview.id);
    expect(exposedIds).not.toContain(archived.id);
  });

  it.each([
    ['DRAFT', () => draft],
    ['PENDING_REVIEW', () => pendingReview],
    ['ARCHIVED', () => archived],
  ])('detalhe: Artigo em %s nunca é acessível, sempre 404', async (_status, getArticle) => {
    const article = getArticle();

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${site.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(404);
  });

  it('detalhe: Artigo PUBLISHED é acessível, 200 (controle positivo)', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${site.slug}/articles/${published.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(published.id);
  });
});
