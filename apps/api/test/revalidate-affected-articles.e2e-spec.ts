import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../src/modules/application/application.module';
import { RevalidateAffectedArticlesUseCase } from '../src/modules/application/application/revalidate-affected-articles.use-case';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Marketplace } from '../src/generated/prisma/enums';
import type { Article, Category, Author, Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * `RevalidateAffectedArticlesUseCase` (integração, REV-005) — consulta
 * pura + coordenação de revalidação, sem controller/contrato próprio, então
 * resolve o caso de uso pelo `TestingModule` (mesmo padrão de
 * `find-affected-published-articles.e2e-spec.ts`), sem `supertest`/HTTP.
 * Exige Postgres real. `RevalidationPort` sobrescrita por um fake — este
 * teste prova a orquestração real (descoberta via consultas Prisma reais +
 * tentativa de revalidação por Artigo), não a chamada HTTP real de
 * `HttpRevalidationAdapter` (já coberta em `http-revalidation.adapter.spec.ts`).
 */
describe('RevalidateAffectedArticlesUseCase (integração)', () => {
  let moduleFixture: TestingModule | undefined;
  let prisma: PrismaService;
  let useCase: RevalidateAffectedArticlesUseCase;
  let revalidationPort: jest.Mocked<RevalidationPort>;
  let siteA: Site;
  let categoryA: Category;
  let authorA: Author;
  let productA: Product;
  let offerA: Offer;

  beforeEach(async () => {
    revalidationPort = { revalidate: jest.fn().mockResolvedValue(undefined) };

    moduleFixture = await Test.createTestingModule({
      imports: [ApplicationModule],
    })
      .overrideProvider(REVALIDATION_PORT)
      .useValue(revalidationPort)
      .compile();

    prisma = moduleFixture.get(PrismaService);
    useCase = moduleFixture.get(RevalidateAffectedArticlesUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'rev005-site-a',
        name: 'Rev005 Site A',
        domain: 'rev005-site-a.test.com',
        locale: 'pt-BR',
      },
    });

    categoryA = await prisma.category.create({
      data: { siteId: siteA.id, name: 'Categoria A', slug: 'rev005-categoria-a' },
    });
    authorA = await prisma.author.create({
      data: { siteId: siteA.id, name: 'Autor A' },
    });
    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Produto A', slug: 'rev005-produto-a' },
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
      where: { article: { site: { slug: { startsWith: 'rev005-' } } } },
    });
    await prisma.article.deleteMany({ where: { site: { slug: { startsWith: 'rev005-' } } } });
    await prisma.offer.deleteMany({ where: { site: { slug: { startsWith: 'rev005-' } } } });
    await prisma.product.deleteMany({ where: { site: { slug: { startsWith: 'rev005-' } } } });
    await prisma.author.deleteMany({ where: { site: { slug: { startsWith: 'rev005-' } } } });
    await prisma.category.deleteMany({ where: { site: { slug: { startsWith: 'rev005-' } } } });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev005-' } } });

    if (moduleFixture) {
      await moduleFixture.close();
      moduleFixture = undefined;
    }
  });

  async function createArticle(
    slug: string,
    overrides: { categoryId?: string; authorId?: string } = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: siteA.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
        categoryId: overrides.categoryId,
        authorId: overrides.authorId,
      },
    });
  }

  async function linkProduct(article: Article, product: Product): Promise<void> {
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id, position: 0 },
    });
  }

  it('revalidateForCategory: zero Artigos afetados, nenhuma chamada de revalidação', async () => {
    await useCase.revalidateForCategory({
      siteId: siteA.id,
      siteSlug: siteA.slug,
      categoryId: categoryA.id,
    });

    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('revalidateForCategory: um Artigo publicado afetado, revalida com siteSlug/articleSlug corretos', async () => {
    const article = await createArticle('rev005-categoria-1', { categoryId: categoryA.id });

    await useCase.revalidateForCategory({
      siteId: siteA.id,
      siteSlug: siteA.slug,
      categoryId: categoryA.id,
    });

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('revalidateForCategory: N Artigos afetados com uma falha isolada, todos tentados, não propaga', async () => {
    const articleA = await createArticle('rev005-categoria-n-1', { categoryId: categoryA.id });
    const articleB = await createArticle('rev005-categoria-n-2', { categoryId: categoryA.id });
    revalidationPort.revalidate.mockImplementation(async ({ articleSlug }) => {
      if (articleSlug === articleA.slug) {
        throw new Error('revalidação indisponível');
      }
    });

    await expect(
      useCase.revalidateForCategory({
        siteId: siteA.id,
        siteSlug: siteA.slug,
        categoryId: categoryA.id,
      }),
    ).resolves.toBeUndefined();

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(2);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: articleB.slug,
    });
  });

  it('revalidateForAuthor: um Artigo publicado afetado, revalida corretamente', async () => {
    const article = await createArticle('rev005-autor-1', { authorId: authorA.id });

    await useCase.revalidateForAuthor({
      siteId: siteA.id,
      siteSlug: siteA.slug,
      authorId: authorA.id,
    });

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('revalidateForProduct: um Artigo publicado vinculado via ArticleProduct, revalida corretamente', async () => {
    const article = await createArticle('rev005-produto-1');
    await linkProduct(article, productA);

    await useCase.revalidateForProduct({
      siteId: siteA.id,
      siteSlug: siteA.slug,
      productId: productA.id,
    });

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('revalidateForOffer: um Artigo publicado afetado via travessia Article → ArticleProduct → Product → Offer, revalida corretamente', async () => {
    const article = await createArticle('rev005-oferta-1');
    await linkProduct(article, productA);

    await useCase.revalidateForOffer({
      siteId: siteA.id,
      siteSlug: siteA.slug,
      offerId: offerA.id,
    });

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('falha de revalidação não impede a conclusão (resolve normalmente, sem propagar)', async () => {
    await createArticle('rev005-revalidacao-falha', { categoryId: categoryA.id });
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));

    await expect(
      useCase.revalidateForCategory({
        siteId: siteA.id,
        siteSlug: siteA.slug,
        categoryId: categoryA.id,
      }),
    ).resolves.toBeUndefined();

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });
});
