import type { Article, ArticleStatus } from '../../../generated/prisma/client';
import type { MarkArticleAsPublishedUseCase } from '../../editorial/application/mark-article-as-published.use-case';
import type { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import type {
  ArticleHealth,
  CalculateArticleHealthUseCase,
} from './calculate-article-health.use-case';
import { PublishArticleUseCase } from './publish-article.use-case';

const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';

function buildArticle(status: ArticleStatus): Article {
  return { id: ARTICLE_ID, siteId: SITE_ID, status } as unknown as Article;
}

function buildHealthyHealth(overrides: Partial<ArticleHealth> = {}): ArticleHealth {
  return {
    categoryActive: true,
    hasAtLeastOneProduct: true,
    allProductsHaveValidOffer: true,
    invalidProducts: [],
    slugUnique: true,
    metaDescriptionFilled: true,
    coverImagePresent: true,
    healthy: true,
    ...overrides,
  };
}

function buildFakes(fixtures: {
  article: Article | null;
  healthResult?: { ok: true; health: ArticleHealth } | { ok: false; reason: 'NOT_FOUND' };
  publishResult?: unknown;
}) {
  const findOneBySite = jest.fn().mockResolvedValue(fixtures.article);
  const calculateExecute = jest
    .fn()
    .mockResolvedValue(fixtures.healthResult ?? { ok: true, health: buildHealthyHealth() });
  const markAsPublishedExecute = jest
    .fn()
    .mockResolvedValue(fixtures.publishResult ?? { ok: true, article: fixtures.article });

  const articleRepository = { findOneBySite } as unknown as PrismaArticleRepository;
  const calculateArticleHealthUseCase = {
    execute: calculateExecute,
  } as unknown as CalculateArticleHealthUseCase;
  const markArticleAsPublishedUseCase = {
    execute: markAsPublishedExecute,
  } as unknown as MarkArticleAsPublishedUseCase;

  const useCase = new PublishArticleUseCase(
    articleRepository,
    calculateArticleHealthUseCase,
    markArticleAsPublishedUseCase,
  );

  return { useCase, findOneBySite, calculateExecute, markAsPublishedExecute };
}

describe('PublishArticleUseCase', () => {
  it('NOT_FOUND quando o Artigo não existe (ou é de outro Site) — não calcula saúde nem publica', async () => {
    const { useCase, calculateExecute, markAsPublishedExecute } = buildFakes({ article: null });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(calculateExecute).not.toHaveBeenCalled();
    expect(markAsPublishedExecute).not.toHaveBeenCalled();
  });

  it('sucesso: PENDING_REVIEW + saúde completa → publica com exatamente uma chamada a markAsPublished', async () => {
    const article = buildArticle('PENDING_REVIEW');
    const { useCase, calculateExecute, markAsPublishedExecute } = buildFakes({
      article,
      publishResult: { ok: true, article: { ...article, status: 'PUBLISHED' } },
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(calculateExecute).toHaveBeenCalledWith({ siteId: SITE_ID, articleId: ARTICLE_ID });
    expect(markAsPublishedExecute).toHaveBeenCalledTimes(1);
    expect(markAsPublishedExecute).toHaveBeenCalledWith({ siteId: SITE_ID, id: ARTICLE_ID });
    expect(result).toEqual({ ok: true, article: { ...article, status: 'PUBLISHED' } });
  });

  it('NOT_FOUND defensivo quando CalculateArticleHealthUseCase devolve NOT_FOUND — não publica', async () => {
    const { useCase, markAsPublishedExecute } = buildFakes({
      article: buildArticle('PENDING_REVIEW'),
      healthResult: { ok: false, reason: 'NOT_FOUND' },
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(markAsPublishedExecute).not.toHaveBeenCalled();
  });

  describe('condições de falha isoladas — cada uma bloqueia sozinha e não publica', () => {
    it('WRONG_STATUS (status diferente de PENDING_REVIEW)', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({ article: buildArticle('DRAFT') });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({ ok: false, reason: 'VALIDATION_FAILED', issues: ['WRONG_STATUS'] });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('CATEGORY_INACTIVE', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({ categoryActive: false, healthy: false }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['CATEGORY_INACTIVE'],
      });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('NO_PRODUCTS', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({ hasAtLeastOneProduct: false, healthy: false }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({ ok: false, reason: 'VALIDATION_FAILED', issues: ['NO_PRODUCTS'] });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('PRODUCT_WITHOUT_VALID_OFFER', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({
            allProductsHaveValidOffer: false,
            invalidProducts: [{ productId: 'product-1', reason: 'NO_OFFERS' }],
            healthy: false,
          }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['PRODUCT_WITHOUT_VALID_OFFER'],
      });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('SLUG_NOT_UNIQUE', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({ slugUnique: false, healthy: false }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['SLUG_NOT_UNIQUE'],
      });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('META_DESCRIPTION_MISSING', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({ metaDescriptionFilled: false, healthy: false }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['META_DESCRIPTION_MISSING'],
      });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });

    it('COVER_IMAGE_MISSING', async () => {
      const { useCase, markAsPublishedExecute } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        healthResult: {
          ok: true,
          health: buildHealthyHealth({ coverImagePresent: false, healthy: false }),
        },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['COVER_IMAGE_MISSING'],
      });
      expect(markAsPublishedExecute).not.toHaveBeenCalled();
    });
  });

  it('múltiplas issues combinadas mantêm ordem determinística fixa, não a ordem de input', async () => {
    const { useCase, markAsPublishedExecute } = buildFakes({
      article: buildArticle('DRAFT'),
      healthResult: {
        ok: true,
        health: buildHealthyHealth({
          coverImagePresent: false,
          hasAtLeastOneProduct: false,
          categoryActive: false,
          healthy: false,
        }),
      },
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result).toEqual({
      ok: false,
      reason: 'VALIDATION_FAILED',
      issues: ['WRONG_STATUS', 'CATEGORY_INACTIVE', 'NO_PRODUCTS', 'COVER_IMAGE_MISSING'],
    });
    expect(markAsPublishedExecute).not.toHaveBeenCalled();
  });

  it('todas as 7 condições falhando ao mesmo tempo: issues nas 7, na ordem fixa', async () => {
    const { useCase } = buildFakes({
      article: buildArticle('DRAFT'),
      healthResult: {
        ok: true,
        health: buildHealthyHealth({
          categoryActive: false,
          hasAtLeastOneProduct: false,
          allProductsHaveValidOffer: false,
          slugUnique: false,
          metaDescriptionFilled: false,
          coverImagePresent: false,
          healthy: false,
        }),
      },
    });

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(result).toEqual({
      ok: false,
      reason: 'VALIDATION_FAILED',
      issues: [
        'WRONG_STATUS',
        'CATEGORY_INACTIVE',
        'NO_PRODUCTS',
        'PRODUCT_WITHOUT_VALID_OFFER',
        'SLUG_NOT_UNIQUE',
        'META_DESCRIPTION_MISSING',
        'COVER_IMAGE_MISSING',
      ],
    });
  });

  describe('EDT-014 falha depois da pré-checagem saudável (janela de corrida)', () => {
    it('WRONG_STATUS do EDT-014 é traduzido para VALIDATION_FAILED com issues: [WRONG_STATUS]', async () => {
      const { useCase } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        publishResult: { ok: false, reason: 'WRONG_STATUS' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
        issues: ['WRONG_STATUS'],
      });
    });

    it('NOT_FOUND do EDT-014 é traduzido para NOT_FOUND', async () => {
      const { useCase } = buildFakes({
        article: buildArticle('PENDING_REVIEW'),
        publishResult: { ok: false, reason: 'NOT_FOUND' },
      });

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    });
  });
});
