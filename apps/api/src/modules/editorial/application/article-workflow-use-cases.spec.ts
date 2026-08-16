import type { Article } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';
import { LinkArticleProductUseCase } from './link-article-product.use-case';
import { UnlinkArticleProductUseCase } from './unlink-article-product.use-case';
import { ReorderArticleProductsUseCase } from './reorder-article-products.use-case';
import { SubmitArticleForReviewUseCase } from './submit-article-for-review.use-case';
import { RevertArticleToDraftUseCase } from './revert-article-to-draft.use-case';
import { RestoreArticleToDraftUseCase } from './restore-article-to-draft.use-case';

/**
 * QA-001 — mesmo critério dos demais specs deste bloco: cada um destes 6
 * casos de uso só delega ao repository (vínculo de Produto — EDT-010 — e as
 * 3 transições de estado alcançáveis por rota própria — EDT-012/013/016).
 * A regra "só em DRAFT", a recompactação de posições e a validação atômica
 * da transição já são responsabilidade do repository, coberta pelos e2e
 * dedicados (`link/unlink/reorder-article-product`,
 * `submit-article-for-review`, `revert-article-to-draft`,
 * `restore-article-to-draft`). `mark-as-published` (EDT-014) e
 * `archive` (EDT-015) ficam fora deste spec: são operações internas sem
 * caminho HTTP direto, já cobertas por spec próprio junto de
 * `application/application`.
 */
const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';
const PRODUCT_ID = 'product-1';

function buildFakeArticleRepository(
  methods: Partial<Record<keyof PrismaArticleRepository, jest.Mock>>,
) {
  return methods as unknown as PrismaArticleRepository;
}

function buildFakeArticleProductRepository(
  methods: Partial<Record<keyof PrismaArticleProductRepository, jest.Mock>>,
) {
  return methods as unknown as PrismaArticleProductRepository;
}

describe('LinkArticleProductUseCase', () => {
  it('delega a linkProduct com o input completo (sucesso)', async () => {
    const linkProduct = jest.fn().mockResolvedValue({ ok: true, productIds: [PRODUCT_ID] });
    const useCase = new LinkArticleProductUseCase(buildFakeArticleProductRepository({ linkProduct }));

    const input = { siteId: SITE_ID, articleId: ARTICLE_ID, productId: PRODUCT_ID };
    const result = await useCase.execute(input);

    expect(linkProduct).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, productIds: [PRODUCT_ID] });
  });

  it.each(['NOT_FOUND', 'NOT_DRAFT', 'ALREADY_LINKED', 'PRODUCT_NOT_FOUND'] as const)(
    'propaga %s sem alterar o resultado',
    async (reason) => {
      const linkProduct = jest.fn().mockResolvedValue({ ok: false, reason });
      const useCase = new LinkArticleProductUseCase(buildFakeArticleProductRepository({ linkProduct }));

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID, productId: PRODUCT_ID });

      expect(result).toEqual({ ok: false, reason });
    },
  );
});

describe('UnlinkArticleProductUseCase', () => {
  it('delega a unlinkProduct com o input completo (sucesso)', async () => {
    const unlinkProduct = jest.fn().mockResolvedValue({ ok: true, productIds: [] });
    const useCase = new UnlinkArticleProductUseCase(buildFakeArticleProductRepository({ unlinkProduct }));

    const input = { siteId: SITE_ID, articleId: ARTICLE_ID, productId: PRODUCT_ID };
    const result = await useCase.execute(input);

    expect(unlinkProduct).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, productIds: [] });
  });

  it.each(['NOT_FOUND', 'NOT_DRAFT', 'NOT_LINKED'] as const)(
    'propaga %s sem alterar o resultado',
    async (reason) => {
      const unlinkProduct = jest.fn().mockResolvedValue({ ok: false, reason });
      const useCase = new UnlinkArticleProductUseCase(buildFakeArticleProductRepository({ unlinkProduct }));

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID, productId: PRODUCT_ID });

      expect(result).toEqual({ ok: false, reason });
    },
  );
});

describe('ReorderArticleProductsUseCase', () => {
  it('delega a reorderProducts com o input completo (sucesso)', async () => {
    const reorderProducts = jest.fn().mockResolvedValue({ ok: true, productIds: [PRODUCT_ID, 'product-2'] });
    const useCase = new ReorderArticleProductsUseCase(buildFakeArticleProductRepository({ reorderProducts }));

    const input = { siteId: SITE_ID, articleId: ARTICLE_ID, productIds: [PRODUCT_ID, 'product-2'] };
    const result = await useCase.execute(input);

    expect(reorderProducts).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, productIds: [PRODUCT_ID, 'product-2'] });
  });

  it.each(['NOT_FOUND', 'NOT_DRAFT', 'INVALID_PRODUCT_SET'] as const)(
    'propaga %s sem alterar o resultado',
    async (reason) => {
      const reorderProducts = jest.fn().mockResolvedValue({ ok: false, reason });
      const useCase = new ReorderArticleProductsUseCase(buildFakeArticleProductRepository({ reorderProducts }));

      const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID, productIds: [PRODUCT_ID] });

      expect(result).toEqual({ ok: false, reason });
    },
  );
});

describe('SubmitArticleForReviewUseCase', () => {
  it('delega a submitForReview com siteId e id corretos (sucesso)', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'PENDING_REVIEW' } as unknown as Article;
    const submitForReview = jest.fn().mockResolvedValue({ ok: true, article: fakeArticle });
    const useCase = new SubmitArticleForReviewUseCase(buildFakeArticleRepository({ submitForReview }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(submitForReview).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it.each(['NOT_FOUND', 'WRONG_STATUS'] as const)('propaga %s sem alterar o resultado', async (reason) => {
    const submitForReview = jest.fn().mockResolvedValue({ ok: false, reason });
    const useCase = new SubmitArticleForReviewUseCase(buildFakeArticleRepository({ submitForReview }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason });
  });
});

describe('RevertArticleToDraftUseCase', () => {
  it('delega a revertToDraft com siteId e id corretos (sucesso)', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'DRAFT' } as unknown as Article;
    const revertToDraft = jest.fn().mockResolvedValue({ ok: true, article: fakeArticle });
    const useCase = new RevertArticleToDraftUseCase(buildFakeArticleRepository({ revertToDraft }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(revertToDraft).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it.each(['NOT_FOUND', 'WRONG_STATUS'] as const)('propaga %s sem alterar o resultado', async (reason) => {
    const revertToDraft = jest.fn().mockResolvedValue({ ok: false, reason });
    const useCase = new RevertArticleToDraftUseCase(buildFakeArticleRepository({ revertToDraft }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason });
  });
});

describe('RestoreArticleToDraftUseCase', () => {
  it('delega a restoreToDraft com siteId e id corretos (sucesso)', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'DRAFT' } as unknown as Article;
    const restoreToDraft = jest.fn().mockResolvedValue({ ok: true, article: fakeArticle });
    const useCase = new RestoreArticleToDraftUseCase(buildFakeArticleRepository({ restoreToDraft }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(restoreToDraft).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it.each(['NOT_FOUND', 'WRONG_STATUS'] as const)('propaga %s sem alterar o resultado', async (reason) => {
    const restoreToDraft = jest.fn().mockResolvedValue({ ok: false, reason });
    const useCase = new RestoreArticleToDraftUseCase(buildFakeArticleRepository({ restoreToDraft }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(result).toEqual({ ok: false, reason });
  });
});
