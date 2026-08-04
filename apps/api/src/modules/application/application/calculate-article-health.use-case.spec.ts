import type { ArticleStatus } from '../../../generated/prisma/enums';
import type { Article, Category } from '../../../generated/prisma/client';
import type { PrismaArticleProductRepository } from '../../editorial/infrastructure/prisma-article-product.repository';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import type { PrismaCategoryRepository } from '../../catalog/infrastructure/prisma-category.repository';
import type {
  OfferSummaryRow,
  PrismaOfferRepository,
} from '../../catalog/infrastructure/prisma-offer.repository';
import { CalculateArticleHealthUseCase } from './calculate-article-health.use-case';

const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';
const CATEGORY_ID = 'category-1';
const PRODUCT_ID_1 = 'product-1';
const PRODUCT_ID_2 = 'product-2';
const PRODUCT_ID_3 = 'product-3';

function buildArticle(
  overrides: Partial<{
    categoryId: string | null;
    metaDescription: string | null;
    coverImageUrl: string | null;
    status: ArticleStatus;
  }> = {},
): Article {
  return {
    id: ARTICLE_ID,
    siteId: SITE_ID,
    categoryId: 'categoryId' in overrides ? overrides.categoryId! : CATEGORY_ID,
    authorId: null,
    type: 'REVIEW',
    status: overrides.status ?? 'DRAFT',
    title: 'Título de teste',
    slug: 'artigo-teste',
    metaDescription: 'metaDescription' in overrides ? overrides.metaDescription! : 'Descrição válida.',
    coverImageUrl:
      'coverImageUrl' in overrides ? overrides.coverImageUrl! : 'https://cdn.test.com/capa.jpg',
    bodyMdx: '',
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Article;
}

function buildCategory(archived: boolean): Category {
  return {
    id: CATEGORY_ID,
    siteId: SITE_ID,
    name: 'Categoria de teste',
    slug: 'categoria-teste',
    archivedAt: archived ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Category;
}

function buildOffer(
  productId: string,
  overrides: Partial<{ archived: boolean; inStock: boolean; affiliateUrl: string }> = {},
): OfferSummaryRow {
  return {
    productId,
    archivedAt: overrides.archived ? new Date() : null,
    inStock: overrides.inStock ?? true,
    affiliateUrl: overrides.affiliateUrl ?? 'https://loja.test.com/produto',
  };
}

function buildFakeRepos(fixtures: {
  article: Article | null;
  productIds?: string[];
  category?: Category | null;
  offers?: OfferSummaryRow[];
}) {
  const findOneBySiteArticle = jest.fn().mockResolvedValue(fixtures.article);
  const findProductIdsByArticle = jest.fn().mockResolvedValue(fixtures.productIds ?? []);
  const findOneBySiteCategory = jest.fn().mockResolvedValue(fixtures.category ?? null);
  const findSummaryByProductIds = jest.fn().mockResolvedValue(fixtures.offers ?? []);

  const articleRepository = {
    findOneBySite: findOneBySiteArticle,
  } as unknown as PrismaArticleRepository;
  const articleProductRepository = {
    findProductIdsByArticle,
  } as unknown as PrismaArticleProductRepository;
  const categoryRepository = {
    findOneBySite: findOneBySiteCategory,
  } as unknown as PrismaCategoryRepository;
  const offerRepository = {
    findSummaryByProductIds,
  } as unknown as PrismaOfferRepository;

  const useCase = new CalculateArticleHealthUseCase(
    articleRepository,
    articleProductRepository,
    categoryRepository,
    offerRepository,
  );

  return {
    useCase,
    findOneBySiteArticle,
    findProductIdsByArticle,
    findOneBySiteCategory,
    findSummaryByProductIds,
  };
}

describe('CalculateArticleHealthUseCase', () => {
  const STATUSES: ArticleStatus[] = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'];

  /**
   * Matriz mínima exigida: 3 cenários × 4 status = 12 casos. `healthy`
   * nunca deve variar com o status — mesmos dados de
   * Categoria/Produto/Oferta/`metaDescription`/`coverImageUrl` em todas as
   * rodadas, só `status` muda.
   */
  describe.each(STATUSES)('status = %s', (status) => {
    it('artigo saudável', async () => {
      const { useCase } = buildFakeRepos({
        article: buildArticle({ status }),
        productIds: [PRODUCT_ID_1],
        category: buildCategory(false),
        offers: [buildOffer(PRODUCT_ID_1)],
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: true,
        health: {
          categoryActive: true,
          hasAtLeastOneProduct: true,
          allProductsHaveValidOffer: true,
          invalidProducts: [],
          slugUnique: true,
          metaDescriptionFilled: true,
          coverImagePresent: true,
          healthy: true,
        },
      });
    });

    it('produto sem Oferta válida', async () => {
      const { useCase } = buildFakeRepos({
        article: buildArticle({ status }),
        productIds: [PRODUCT_ID_1],
        category: buildCategory(false),
        offers: [buildOffer(PRODUCT_ID_1, { archived: true })],
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: true,
        health: {
          categoryActive: true,
          hasAtLeastOneProduct: true,
          allProductsHaveValidOffer: false,
          invalidProducts: [{ productId: PRODUCT_ID_1, reason: 'NO_VALID_OFFER' }],
          slugUnique: true,
          metaDescriptionFilled: true,
          coverImagePresent: true,
          healthy: false,
        },
      });
    });

    it('sem nenhum Produto', async () => {
      const { useCase } = buildFakeRepos({
        article: buildArticle({ status }),
        productIds: [],
        category: buildCategory(false),
        offers: [],
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: true,
        health: {
          categoryActive: true,
          hasAtLeastOneProduct: false,
          allProductsHaveValidOffer: true,
          invalidProducts: [],
          slugUnique: true,
          metaDescriptionFilled: true,
          coverImagePresent: true,
          healthy: false,
        },
      });
    });
  });

  it('NOT_FOUND quando o Artigo não existe (ou é de outro Site)', async () => {
    const { useCase } = buildFakeRepos({ article: null });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('categoryActive = false quando categoryId é null', async () => {
    const { useCase, findOneBySiteCategory } = buildFakeRepos({
      article: buildArticle({ categoryId: null }),
      productIds: [],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.categoryActive).toBe(false);
    expect(findOneBySiteCategory).not.toHaveBeenCalled();
  });

  it('categoryActive = false quando a Categoria está arquivada', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [],
      category: buildCategory(true),
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.categoryActive).toBe(false);
  });

  it('categoryActive = false quando a Categoria referenciada não existe (defensivo)', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [],
      category: null,
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.categoryActive).toBe(false);
  });

  it('NO_OFFERS quando o Produto não tem nenhuma Oferta cadastrada', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [PRODUCT_ID_1],
      category: buildCategory(false),
      offers: [],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.invalidProducts).toEqual([
      { productId: PRODUCT_ID_1, reason: 'NO_OFFERS' },
    ]);
  });

  it('NO_VALID_OFFER quando a única Oferta está fora de estoque', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [PRODUCT_ID_1],
      category: buildCategory(false),
      offers: [buildOffer(PRODUCT_ID_1, { inStock: false })],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.invalidProducts).toEqual([
      { productId: PRODUCT_ID_1, reason: 'NO_VALID_OFFER' },
    ]);
  });

  it('NO_VALID_OFFER quando a única Oferta tem affiliateUrl inválida', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [PRODUCT_ID_1],
      category: buildCategory(false),
      offers: [buildOffer(PRODUCT_ID_1, { affiliateUrl: 'não-é-uma-url' })],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.invalidProducts).toEqual([
      { productId: PRODUCT_ID_1, reason: 'NO_VALID_OFFER' },
    ]);
  });

  it('Produto com múltiplas Ofertas é válido se ao menos uma delas atender aos 3 critérios', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [PRODUCT_ID_1],
      category: buildCategory(false),
      offers: [
        buildOffer(PRODUCT_ID_1, { archived: true }),
        buildOffer(PRODUCT_ID_1, { inStock: false }),
        buildOffer(PRODUCT_ID_1),
      ],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.allProductsHaveValidOffer).toBe(true);
    expect(result.ok && result.health.invalidProducts).toEqual([]);
  });

  it('invalidProducts preserva a ordem de ArticleProduct.position entre múltiplos Produtos', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [PRODUCT_ID_1, PRODUCT_ID_2, PRODUCT_ID_3],
      category: buildCategory(false),
      offers: [
        buildOffer(PRODUCT_ID_1, { archived: true }),
        buildOffer(PRODUCT_ID_2),
        buildOffer(PRODUCT_ID_3, { inStock: false }),
      ],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.invalidProducts).toEqual([
      { productId: PRODUCT_ID_1, reason: 'NO_VALID_OFFER' },
      { productId: PRODUCT_ID_3, reason: 'NO_VALID_OFFER' },
    ]);
  });

  it.each([null, '', '   '])('metaDescriptionFilled = false para %p', async (value) => {
    const { useCase } = buildFakeRepos({
      article: buildArticle({ metaDescription: value }),
      productIds: [],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.metaDescriptionFilled).toBe(false);
  });

  it('coverImagePresent = false quando coverImageUrl é null', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle({ coverImageUrl: null }),
      productIds: [],
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.coverImagePresent).toBe(false);
  });

  it('slugUnique é sempre true (garantido pela constraint do banco)', async () => {
    const { useCase } = buildFakeRepos({
      article: buildArticle(),
      productIds: [],
      category: buildCategory(false),
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result.ok).toBe(true);
    expect(result.ok && result.health.slugUnique).toBe(true);
  });
});
