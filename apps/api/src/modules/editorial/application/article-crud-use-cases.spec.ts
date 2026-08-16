import type { Article } from '../../../generated/prisma/client';
import type { PrismaArticleRepository } from '../infrastructure/prisma-article.repository';
import type { PrismaArticleProductRepository } from '../infrastructure/prisma-article-product.repository';
import { CreateArticleUseCase } from './create-article.use-case';
import { GetArticleUseCase } from './get-article.use-case';
import { ListArticlesUseCase } from './list-articles.use-case';
import { UpdateArticleUseCase } from './update-article.use-case';
import { GetArticleProductsUseCase } from './get-article-products.use-case';

/**
 * QA-001 — mesmo critério dos specs de Categoria/Produto/Oferta/Autor,
 * aplicado ao CRUD base de Artigo (EDT-006/007/008/009) e à leitura de
 * `productId`s vinculados (incremento ADM-009 sobre EDT-010). A restrição
 * "só em DRAFT" e a máquina de estados (EDT-012..016) já são cobertas pelos
 * e2e dedicados — este spec só prova o roteamento para o repository.
 */
const SITE_ID = 'site-1';
const ARTICLE_ID = 'article-1';

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

describe('CreateArticleUseCase', () => {
  it('delega ao repository e devolve o resultado tal como recebido (sucesso)', async () => {
    const fakeArticle = { id: ARTICLE_ID, status: 'DRAFT' } as unknown as Article;
    const create = jest.fn().mockResolvedValue({ ok: true, article: fakeArticle });
    const useCase = new CreateArticleUseCase(buildFakeArticleRepository({ create }));

    const input = { siteId: SITE_ID, type: 'COMPARISON' as const, title: 'Título', slug: 'titulo' };
    const result = await useCase.execute(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it.each(['SLUG_CONFLICT', 'CATEGORY_NOT_FOUND', 'AUTHOR_NOT_FOUND'] as const)(
    'propaga %s sem alterar o resultado',
    async (reason) => {
      const create = jest.fn().mockResolvedValue({ ok: false, reason });
      const useCase = new CreateArticleUseCase(buildFakeArticleRepository({ create }));

      const result = await useCase.execute({
        siteId: SITE_ID,
        type: 'COMPARISON' as const,
        title: 'Título',
        slug: 'titulo',
      });

      expect(result).toEqual({ ok: false, reason });
    },
  );
});

describe('GetArticleUseCase', () => {
  it('delega a findOneBySite com siteId e id corretos', async () => {
    const fakeArticle = { id: ARTICLE_ID } as unknown as Article;
    const findOneBySite = jest.fn().mockResolvedValue(fakeArticle);
    const useCase = new GetArticleUseCase(buildFakeArticleRepository({ findOneBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID });

    expect(findOneBySite).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toBe(fakeArticle);
  });

  it('devolve null quando não encontra', async () => {
    const findOneBySite = jest.fn().mockResolvedValue(null);
    const useCase = new GetArticleUseCase(buildFakeArticleRepository({ findOneBySite }));

    expect(await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID })).toBeNull();
  });
});

describe('ListArticlesUseCase', () => {
  it('delega findManyBySite propagando status/type/categoryId e calcula totalPages', async () => {
    const items = [{ id: ARTICLE_ID }] as unknown as Article[];
    const findManyBySite = jest.fn().mockResolvedValue({ items, total: 21 });
    const useCase = new ListArticlesUseCase(buildFakeArticleRepository({ findManyBySite }));

    const result = await useCase.execute({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      status: 'PUBLISHED',
      type: 'COMPARISON',
      categoryId: 'category-1',
    });

    expect(findManyBySite).toHaveBeenCalledWith({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      status: 'PUBLISHED',
      type: 'COMPARISON',
      categoryId: 'category-1',
    });
    expect(result).toEqual({ items, page: 2, pageSize: 10, total: 21, totalPages: 3 });
  });

  it('total 0 resulta em totalPages 0', async () => {
    const findManyBySite = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = new ListArticlesUseCase(buildFakeArticleRepository({ findManyBySite }));

    const result = await useCase.execute({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(0);
  });
});

describe('UpdateArticleUseCase', () => {
  it('delega a updateBySite com o input completo (sucesso)', async () => {
    const fakeArticle = { id: ARTICLE_ID } as unknown as Article;
    const updateBySite = jest.fn().mockResolvedValue({ ok: true, article: fakeArticle });
    const useCase = new UpdateArticleUseCase(buildFakeArticleRepository({ updateBySite }));

    const input = { siteId: SITE_ID, id: ARTICLE_ID, title: 'Novo título' };
    const result = await useCase.execute(input);

    expect(updateBySite).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, article: fakeArticle });
  });

  it.each(['NOT_FOUND', 'NOT_DRAFT', 'SLUG_CONFLICT', 'CATEGORY_NOT_FOUND', 'AUTHOR_NOT_FOUND'] as const)(
    'propaga %s sem alterar o resultado',
    async (reason) => {
      const updateBySite = jest.fn().mockResolvedValue({ ok: false, reason });
      const useCase = new UpdateArticleUseCase(buildFakeArticleRepository({ updateBySite }));

      const result = await useCase.execute({ siteId: SITE_ID, id: ARTICLE_ID, title: 'X' });

      expect(result).toEqual({ ok: false, reason });
    },
  );
});

describe('GetArticleProductsUseCase', () => {
  it('delega a findProductIdsByArticle com siteId e articleId corretos', async () => {
    const findProductIdsByArticle = jest.fn().mockResolvedValue(['product-1', 'product-2']);
    const useCase = new GetArticleProductsUseCase(
      buildFakeArticleProductRepository({ findProductIdsByArticle }),
    );

    const result = await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID });

    expect(findProductIdsByArticle).toHaveBeenCalledWith(SITE_ID, ARTICLE_ID);
    expect(result).toEqual(['product-1', 'product-2']);
  });

  it('devolve [] tanto para "Artigo sem produtos" quanto para "Artigo inexistente" (mesmo critério de GetArticleUseCase)', async () => {
    const findProductIdsByArticle = jest.fn().mockResolvedValue([]);
    const useCase = new GetArticleProductsUseCase(
      buildFakeArticleProductRepository({ findProductIdsByArticle }),
    );

    expect(await useCase.execute({ siteId: SITE_ID, articleId: ARTICLE_ID })).toEqual([]);
  });
});
