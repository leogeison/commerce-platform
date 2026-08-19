import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { publicArticleSchema } from '@commerce-platform/contracts';
import { EditorialModule } from '../src/modules/editorial/editorial.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleType, Marketplace } from '../src/generated/prisma/enums';
import type { Article, Author, Category, Product, Site } from '../src/generated/prisma/client';

/**
 * `GET /public/sites/:siteSlug/articles/:slug` (e2e, PUB-003). Exige
 * Postgres real (mesmo requisito dos demais e2e do projeto).
 */
describe('GET /public/sites/:siteSlug/articles/:slug (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let siteA: Site;
  let siteB: Site;
  let category: Category;
  let categoryB: Category;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EditorialModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    siteA = await prisma.site.create({
      data: {
        slug: 'pub003-site-a',
        name: 'Pub003 Site A',
        domain: 'pub003-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'pub003-site-b',
        name: 'Pub003 Site B',
        domain: 'pub003-site-b.test.com',
        locale: 'pt-BR',
      },
    });
    category = await prisma.category.create({
      data: { siteId: siteA.id, name: 'Categoria Pub003', slug: 'categoria-pub003' },
    });
    categoryB = await prisma.category.create({
      data: { siteId: siteB.id, name: 'Categoria Pub003 B', slug: 'categoria-pub003-b' },
    });
  });

  afterEach(async () => {
    await prisma.articleProduct.deleteMany({
      where: { article: { site: { slug: { startsWith: 'pub003-' } } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'pub003-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'pub003-' } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'pub003-' } } },
    });
    await prisma.author.deleteMany({
      where: { site: { slug: { startsWith: 'pub003-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'pub003-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'pub003-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createArticle(
    site: Site,
    slug: string,
    overrides: Partial<{
      status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
      categoryId: string;
      publishedAt: Date;
      authorId: string;
    }> = {},
  ): Promise<Article> {
    return prisma.article.create({
      data: {
        siteId: site.id,
        title: `Artigo ${slug}`,
        slug,
        type: ArticleType.REVIEW,
        status: overrides.status ?? 'PUBLISHED',
        categoryId: overrides.categoryId ?? category.id,
        authorId: overrides.authorId,
        publishedAt:
          overrides.status === undefined || overrides.status === 'PUBLISHED'
            ? (overrides.publishedAt ?? new Date())
            : undefined,
        bodyMdx: '# Conteúdo do Artigo',
      },
    });
  }

  /**
   * Cria um `Author` real no banco (UXF-011) — inclui `bio` deliberadamente
   * preenchida por padrão, para que o teste de não-vazamento tenha um
   * campo interno real disponível na linha e prove que a resposta HTTP não
   * o expõe (não bastaria testar contra um Author sem `bio`/`userId`
   * preenchidos).
   */
  async function createAuthor(
    site: Site,
    overrides: Partial<{ name: string; avatarUrl: string | null; bio: string | null }> = {},
  ): Promise<Author> {
    return prisma.author.create({
      data: {
        siteId: site.id,
        name: overrides.name ?? 'Autora Pub003',
        avatarUrl: overrides.avatarUrl ?? null,
        bio: overrides.bio ?? 'Bio interna, nunca deve aparecer na API pública.',
      },
    });
  }

  async function createProduct(
    site: Site,
    slug: string,
    overrides: Partial<{ archived: boolean }> = {},
  ): Promise<Product> {
    return prisma.product.create({
      data: {
        siteId: site.id,
        name: `Produto ${slug}`,
        slug,
        description: `Descrição do ${slug}`,
        imageUrl: `https://cdn.test.com/${slug}.jpg`,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  async function linkProduct(
    site: Site,
    article: Article,
    product: Product,
    position: number,
  ): Promise<void> {
    await prisma.articleProduct.create({
      data: { siteId: site.id, articleId: article.id, productId: product.id, position },
    });
  }

  async function createOffer(
    site: Site,
    product: Product,
    overrides: Partial<{
      marketplace: Marketplace;
      price: string;
      inStock: boolean;
      archived: boolean;
    }> = {},
  ) {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: overrides.marketplace ?? Marketplace.MERCADO_LIVRE,
        price: overrides.price ?? '99.90',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
        inStock: overrides.inStock ?? true,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  it('200: corpo completo válido contra publicArticleSchema, com categorySlug e bodyMdx', async () => {
    const article = await createArticle(siteA, 'artigo-completo');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(publicArticleSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.id).toBe(article.id);
    expect(response.body.categorySlug).toBe(category.slug);
    expect(response.body.bodyMdx).toBe('# Conteúdo do Artigo');
    expect(response.body.products).toEqual([]);
  });

  it('não expõe status, siteId, authorId nem affiliateUrl', async () => {
    const article = await createArticle(siteA, 'artigo-sem-campos-internos');
    const product = await createProduct(siteA, 'produto-sem-campos-internos');
    await linkProduct(siteA, article, product, 0);
    await createOffer(siteA, product);

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('status');
    expect(response.body).not.toHaveProperty('siteId');
    expect(response.body).not.toHaveProperty('authorId');
    expect(response.body.products[0].offers[0]).not.toHaveProperty('affiliateUrl');
    expect(response.body.products[0].offers[0]).not.toHaveProperty('archivedAt');
  });

  it('404: slug inexistente', async () => {
    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/slug-que-nao-existe`,
    );

    expect(response.status).toBe(404);
  });

  it('404: slug existe, mas em DRAFT/PENDING_REVIEW/ARCHIVED', async () => {
    const draft = await createArticle(siteA, 'artigo-rascunho', { status: 'DRAFT' });
    const pendingReview = await createArticle(siteA, 'artigo-em-revisao', {
      status: 'PENDING_REVIEW',
    });
    const archived = await createArticle(siteA, 'artigo-arquivado', { status: 'ARCHIVED' });

    for (const notPublished of [draft, pendingReview, archived]) {
      const response = await request(app!.getHttpServer()).get(
        `/public/sites/${siteA.slug}/articles/${notPublished.slug}`,
      );
      expect(response.status).toBe(404);
    }
  });

  it('404: slug existe, mas em outro Site (isolamento por Site)', async () => {
    const articleInSiteB = await createArticle(siteB, 'artigo-de-outro-site', {
      categoryId: categoryB.id,
    });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${articleInSiteB.slug}`,
    );

    expect(response.status).toBe(404);
  });

  it('404: siteSlug inexistente', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/public/sites/pub003-site-inexistente/articles/qualquer-slug',
    );

    expect(response.status).toBe(404);
  });

  it('products[] ordenado por position asc', async () => {
    const article = await createArticle(siteA, 'artigo-produtos-ordenados');
    const second = await createProduct(siteA, 'produto-ordenado-segundo');
    const first = await createProduct(siteA, 'produto-ordenado-primeiro');
    await linkProduct(siteA, article, second, 1);
    await linkProduct(siteA, article, first, 0);

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.products.map((p: { id: string }) => p.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('Oferta arquivada é excluída de offers[]; Oferta com inStock: false permanece', async () => {
    const article = await createArticle(siteA, 'artigo-ofertas-filtradas');
    const product = await createProduct(siteA, 'produto-ofertas-filtradas');
    await linkProduct(siteA, article, product, 0);
    const active = await createOffer(siteA, product, { inStock: true });
    const outOfStock = await createOffer(siteA, product, { inStock: false });
    await createOffer(siteA, product, { archived: true });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    const offerIds = response.body.products[0].offers.map((o: { id: string }) => o.id);
    expect(offerIds).toContain(active.id);
    expect(offerIds).toContain(outOfStock.id);
    expect(offerIds).toHaveLength(2);
    expect(
      response.body.products[0].offers.find((o: { id: string }) => o.id === outOfStock.id)
        .inStock,
    ).toBe(false);
  });

  it('Produto arquivado permanece em products[]; se todas as Ofertas dele estiverem arquivadas, offers: []', async () => {
    const article = await createArticle(siteA, 'artigo-produto-arquivado');
    const archivedProduct = await createProduct(siteA, 'produto-arquivado', { archived: true });
    await linkProduct(siteA, article, archivedProduct, 0);
    await createOffer(siteA, archivedProduct, { archived: true });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0].id).toBe(archivedProduct.id);
    expect(response.body.products[0].offers).toEqual([]);
  });

  it('price serializado como string com duas casas decimais', async () => {
    const article = await createArticle(siteA, 'artigo-preco-string');
    const product = await createProduct(siteA, 'produto-preco-string');
    await linkProduct(siteA, article, product, 0);
    await createOffer(siteA, product, { price: '1234.5' });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.products[0].offers[0].price).toBe('1234.50');
    expect(typeof response.body.products[0].offers[0].price).toBe('string');
  });

  it('Artigo com Autor vinculado: author com name/avatarUrl corretos (UXF-011)', async () => {
    const author = await createAuthor(siteA, {
      name: 'Autora Exemplo',
      avatarUrl: 'https://cdn.test.com/avatar.jpg',
    });
    const article = await createArticle(siteA, 'artigo-com-autor', { authorId: author.id });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(publicArticleSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.author).toEqual({
      name: 'Autora Exemplo',
      avatarUrl: 'https://cdn.test.com/avatar.jpg',
    });
  });

  it('Artigo sem Autor vinculado: author null, nunca erro (UXF-011)', async () => {
    const article = await createArticle(siteA, 'artigo-sem-autor');

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(publicArticleSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.author).toBeNull();
  });

  it('author nunca expõe id/siteId/userId/bio, mesmo com todos preenchidos no banco (UXF-011)', async () => {
    const author = await createAuthor(siteA, {
      name: 'Autora Com Campos Internos',
      bio: 'Bio interna real, preenchida de propósito.',
    });
    const article = await createArticle(siteA, 'artigo-autor-sem-campos-internos', {
      authorId: author.id,
    });

    const response = await request(app!.getHttpServer()).get(
      `/public/sites/${siteA.slug}/articles/${article.slug}`,
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.author)).toEqual(['name', 'avatarUrl']);
    expect(response.body.author).not.toHaveProperty('id');
    expect(response.body.author).not.toHaveProperty('siteId');
    expect(response.body.author).not.toHaveProperty('userId');
    expect(response.body.author).not.toHaveProperty('bio');
  });
});
