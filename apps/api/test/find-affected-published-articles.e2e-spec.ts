import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../src/modules/application/application.module';
import { FindAffectedPublishedArticlesUseCase } from '../src/modules/application/application/find-affected-published-articles.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Marketplace } from '../src/generated/prisma/enums';
import type { Article, Category, Author, Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * `FindAffectedPublishedArticlesUseCase` (integração, APP-005) — consulta
 * pura, sem controller/contrato próprio, então resolve o caso de uso pelo
 * `TestingModule` (mesmo padrão de EDT-014), sem `supertest`/HTTP. Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto). Sem teste
 * unitário mockado: os quatro métodos são delegação pura, o valor real
 * está nas consultas Prisma (filtro `siteId`/`status: PUBLISHED`,
 * travessia de relação de `findPublishedByOffer`), só verificável contra
 * o banco.
 */
describe('FindAffectedPublishedArticlesUseCase (integração, APP-005)', () => {
  let moduleFixture: TestingModule | undefined;
  let prisma: PrismaService;
  let useCase: FindAffectedPublishedArticlesUseCase;
  let siteA: Site;
  let siteB: Site;
  let categoryA: Category;
  let authorA: Author;
  let productA: Product;
  let offerA: Offer;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    useCase = moduleFixture.get(FindAffectedPublishedArticlesUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'app005-site-a',
        name: 'App005 Site A',
        domain: 'app005-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'app005-site-b',
        name: 'App005 Site B',
        domain: 'app005-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    categoryA = await prisma.category.create({
      data: { siteId: siteA.id, name: 'Categoria A', slug: 'app005-categoria-a' },
    });
    authorA = await prisma.author.create({
      data: { siteId: siteA.id, name: 'Autor A' },
    });
    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto A', slug: 'app005-produto-a' },
    });
    offerA = await prisma.offer.create({
      data: {
        siteId: siteA.id,
        productId: productA.id,
        marketplace: Marketplace.AMAZON_BR,
        price: '10.00',
        affiliateUrl: 'https://loja.test.com/produto-a',
      },
    });
  });

  afterEach(async () => {
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'app005-' } } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'app005-' } } } });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'app005-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'app005-' } } } });
    await prisma.author.deleteMany({ where: { site: { slug: { startsWith: 'app005-' } } } });
    await prisma.category.deleteMany({ where: { site: { slug: { startsWith: 'app005-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'app005-' } } });

    if (moduleFixture) {
      await moduleFixture.close();
      moduleFixture = undefined;
    }
  });

  async function createArticle(
    site: Site,
    slug: string,
    status: ArticleStatus,
    overrides: { categoryId?: string; authorId?: string } = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status,
        categoryId: overrides.categoryId,
        authorId: overrides.authorId,
      },
    });
  }

  async function linkProduct(site: Site, article: Article, product: Product): Promise<void> {
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position: 0 },
    });
  }

  describe('findByCategory', () => {
    it('0 Artigos publicados: []', async () => {
      const result = await useCase.findByCategory(siteA.id, categoryA.id);
      expect(result).toEqual([]);
    });

    it('1 Artigo publicado', async () => {
      const article = await createArticle(siteA, 'app005-categoria-1', ArticleStatus.PUBLISHED, {
        categoryId: categoryA.id,
      });

      const result = await useCase.findByCategory(siteA.id, categoryA.id);

      expect(result.map((a) => a.id)).toEqual([article.id]);
    });

    it('N Artigos publicados, ordenados por id asc', async () => {
      const articles = await Promise.all([
        createArticle(siteA, 'app005-categoria-n-1', ArticleStatus.PUBLISHED, {
          categoryId: categoryA.id,
        }),
        createArticle(siteA, 'app005-categoria-n-2', ArticleStatus.PUBLISHED, {
          categoryId: categoryA.id,
        }),
        createArticle(siteA, 'app005-categoria-n-3', ArticleStatus.PUBLISHED, {
          categoryId: categoryA.id,
        }),
      ]);
      const expectedIds = articles.map((a) => a.id).sort();

      const result = await useCase.findByCategory(siteA.id, categoryA.id);

      expect(result.map((a) => a.id)).toEqual(expectedIds);
    });

    it('isolamento cross-site: categoryId real de outro Site não vaza', async () => {
      const result = await useCase.findByCategory(siteB.id, categoryA.id);
      expect(result).toEqual([]);
    });
  });

  describe('findByAuthor', () => {
    it('0 Artigos publicados: []', async () => {
      const result = await useCase.findByAuthor(siteA.id, authorA.id);
      expect(result).toEqual([]);
    });

    it('1 Artigo publicado', async () => {
      const article = await createArticle(siteA, 'app005-autor-1', ArticleStatus.PUBLISHED, {
        authorId: authorA.id,
      });

      const result = await useCase.findByAuthor(siteA.id, authorA.id);

      expect(result.map((a) => a.id)).toEqual([article.id]);
    });

    it('N Artigos publicados, ordenados por id asc', async () => {
      const articles = await Promise.all([
        createArticle(siteA, 'app005-autor-n-1', ArticleStatus.PUBLISHED, {
          authorId: authorA.id,
        }),
        createArticle(siteA, 'app005-autor-n-2', ArticleStatus.PUBLISHED, {
          authorId: authorA.id,
        }),
      ]);
      const expectedIds = articles.map((a) => a.id).sort();

      const result = await useCase.findByAuthor(siteA.id, authorA.id);

      expect(result.map((a) => a.id)).toEqual(expectedIds);
    });

    it('isolamento cross-site: authorId real de outro Site não vaza', async () => {
      const result = await useCase.findByAuthor(siteB.id, authorA.id);
      expect(result).toEqual([]);
    });
  });

  describe('findByProduct', () => {
    it('0 Artigos publicados: []', async () => {
      const result = await useCase.findByProduct(siteA.id, productA.id);
      expect(result).toEqual([]);
    });

    it('1 Artigo publicado', async () => {
      const article = await createArticle(siteA, 'app005-produto-1', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article, productA);

      const result = await useCase.findByProduct(siteA.id, productA.id);

      expect(result.map((a) => a.id)).toEqual([article.id]);
    });

    it('N Artigos publicados, ordenados por id asc, sem duplicatas mesmo com outros vínculos', async () => {
      const otherProduct = await prisma.product.create({
        data: { siteId: siteA.id, name: 'Produto Extra', slug: 'app005-produto-extra' },
      });

      const article1 = await createArticle(siteA, 'app005-produto-n-1', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article1, productA);
      // vínculo extra a um Produto diferente — não deve gerar linha duplicada
      // nem influenciar o resultado desta consulta.
      await linkProduct(siteA, article1, otherProduct);

      const article2 = await createArticle(siteA, 'app005-produto-n-2', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article2, productA);

      const expectedIds = [article1.id, article2.id].sort();

      const result = await useCase.findByProduct(siteA.id, productA.id);

      expect(result.map((a) => a.id)).toEqual(expectedIds);
      expect(result.length).toBe(new Set(result.map((a) => a.id)).size);
    });

    it('isolamento cross-site: productId real de outro Site não vaza', async () => {
      const result = await useCase.findByProduct(siteB.id, productA.id);
      expect(result).toEqual([]);
    });
  });

  describe('findByOffer', () => {
    it('0 Artigos publicados: []', async () => {
      const result = await useCase.findByOffer(siteA.id, offerA.id);
      expect(result).toEqual([]);
    });

    it('1 Artigo publicado (travessia Article → ArticleProduct → Product → Offer)', async () => {
      const article = await createArticle(siteA, 'app005-oferta-1', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article, productA);

      const result = await useCase.findByOffer(siteA.id, offerA.id);

      expect(result.map((a) => a.id)).toEqual([article.id]);
    });

    it('N Artigos publicados, ordenados por id asc, sem duplicatas mesmo com múltiplas Ofertas no Produto', async () => {
      // Produto com uma segunda Oferta — a consulta busca só `offerA`,
      // então a existência de outra Oferta no mesmo Produto não deve
      // duplicar nem alterar o resultado.
      await prisma.offer.create({
        data: {
          siteId: siteA.id,
          productId: productA.id,
          marketplace: Marketplace.MERCADO_LIVRE,
          price: '20.00',
          affiliateUrl: 'https://loja.test.com/produto-a-alt',
        },
      });

      const article1 = await createArticle(siteA, 'app005-oferta-n-1', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article1, productA);
      const article2 = await createArticle(siteA, 'app005-oferta-n-2', ArticleStatus.PUBLISHED);
      await linkProduct(siteA, article2, productA);

      const expectedIds = [article1.id, article2.id].sort();

      const result = await useCase.findByOffer(siteA.id, offerA.id);

      expect(result.map((a) => a.id)).toEqual(expectedIds);
      expect(result.length).toBe(new Set(result.map((a) => a.id)).size);
    });

    it('isolamento cross-site: offerId real de outro Site não vaza através da travessia aninhada', async () => {
      const result = await useCase.findByOffer(siteB.id, offerA.id);
      expect(result).toEqual([]);
    });
  });

  it('Artigos em DRAFT, PENDING_REVIEW e ARCHIVED nunca aparecem em nenhum dos quatro métodos', async () => {
    const draft = await createArticle(siteA, 'app005-status-draft', ArticleStatus.DRAFT, {
      categoryId: categoryA.id,
      authorId: authorA.id,
    });
    const pendingReview = await createArticle(
      siteA,
      'app005-status-pending',
      ArticleStatus.PENDING_REVIEW,
      { categoryId: categoryA.id, authorId: authorA.id },
    );
    const archived = await createArticle(siteA, 'app005-status-archived', ArticleStatus.ARCHIVED, {
      categoryId: categoryA.id,
      authorId: authorA.id,
    });
    const published = await createArticle(
      siteA,
      'app005-status-published',
      ArticleStatus.PUBLISHED,
      { categoryId: categoryA.id, authorId: authorA.id },
    );

    await linkProduct(siteA, draft, productA);
    await linkProduct(siteA, pendingReview, productA);
    await linkProduct(siteA, archived, productA);
    await linkProduct(siteA, published, productA);

    const byCategory = await useCase.findByCategory(siteA.id, categoryA.id);
    const byAuthor = await useCase.findByAuthor(siteA.id, authorA.id);
    const byProduct = await useCase.findByProduct(siteA.id, productA.id);
    const byOffer = await useCase.findByOffer(siteA.id, offerA.id);

    for (const result of [byCategory, byAuthor, byProduct, byOffer]) {
      const ids = result.map((a) => a.id);
      expect(ids).toEqual([published.id]);
      expect(ids).not.toContain(draft.id);
      expect(ids).not.toContain(pendingReview.id);
      expect(ids).not.toContain(archived.id);
    }
  });
});
