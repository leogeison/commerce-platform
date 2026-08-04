import { Injectable } from '@nestjs/common';
import { affiliateUrlSchema } from '@commerce-platform/contracts';
import { PrismaArticleProductRepository } from '../../editorial/infrastructure/prisma-article-product.repository';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { PrismaCategoryRepository } from '../../catalog/infrastructure/prisma-category.repository';
import {
  PrismaOfferRepository,
  type OfferSummaryRow,
} from '../../catalog/infrastructure/prisma-offer.repository';

export type InvalidProductReason = 'NO_OFFERS' | 'NO_VALID_OFFER';

export interface InvalidProduct {
  productId: string;
  reason: InvalidProductReason;
}

export interface ArticleHealth {
  categoryActive: boolean;
  hasAtLeastOneProduct: boolean;
  allProductsHaveValidOffer: boolean;
  invalidProducts: InvalidProduct[];
  slugUnique: boolean;
  metaDescriptionFilled: boolean;
  coverImagePresent: boolean;
  healthy: boolean;
}

export interface CalculateArticleHealthInput {
  siteId: string;
  articleId: string;
}

export type CalculateArticleHealthResult =
  | { ok: true; health: ArticleHealth }
  | { ok: false; reason: 'NOT_FOUND' };

/**
 * Calcula o read model `/health` de um Artigo (APP-001) — não persistido,
 * recalculado a cada chamada (Architecture.md §12: "'Pendente' não é um
 * status persistido — é calculado por um read model (`/health`), nunca
 * armazenado").
 *
 * Primeiro caso de uso do módulo `application` (Architecture.md §14):
 * orquestra Editorial (`PrismaArticleRepository`,
 * `PrismaArticleProductRepository`) e Catalog (`PrismaCategoryRepository`,
 * `PrismaOfferRepository`) sem que nenhum dos dois domínios dependa
 * diretamente do outro — a lógica cross-domain mora só aqui.
 *
 * As 6 condições calculadas são exatamente as 6 regras de bloqueio de
 * publicação documentadas (Architecture.md §12): Categoria ativa; ao
 * menos um Produto vinculado; cada Produto com Oferta válida; slug único;
 * `metaDescription` preenchida; capa presente. `healthy` é o `AND` das 6
 * — **nunca** considera o `status` atual do Artigo (decisão explícita: o
 * checklist é status-agnóstico, a mesma computação vale para qualquer
 * status; a checagem adicional de `status === PENDING_REVIEW`, exigida só
 * no momento de publicar, é responsabilidade de `APP-002`, fora desta
 * tarefa). A diferença de "framing" por status
 * (preparação/prontidão/operacional/informativo, Architecture.md §32) é
 * decisão de UI, fora deste caso de uso (ADM-011).
 *
 * `slugUnique` está sempre `true`: garantida estruturalmente pela
 * constraint `@@unique([siteId, slug])` do Prisma — nunca falsa para um
 * Artigo já persistido. Mantida na saída porque é uma das 6 condições
 * documentadas oficialmente (decisão explícita desta tarefa).
 */
@Injectable()
export class CalculateArticleHealthUseCase {
  constructor(
    private readonly articleRepository: PrismaArticleRepository,
    private readonly articleProductRepository: PrismaArticleProductRepository,
    private readonly categoryRepository: PrismaCategoryRepository,
    private readonly offerRepository: PrismaOfferRepository,
  ) {}

  async execute(input: CalculateArticleHealthInput): Promise<CalculateArticleHealthResult> {
    const article = await this.articleRepository.findOneBySite(input.siteId, input.articleId);

    if (!article) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const categoryActive = await this.isCategoryActive(input.siteId, article.categoryId);

    const productIds = await this.articleProductRepository.findProductIdsByArticle(
      input.siteId,
      input.articleId,
    );
    const hasAtLeastOneProduct = productIds.length > 0;

    const invalidProducts = await this.findInvalidProducts(input.siteId, productIds);
    const allProductsHaveValidOffer = invalidProducts.length === 0;

    const slugUnique = true;
    const metaDescriptionFilled = isFilled(article.metaDescription);
    const coverImagePresent = isFilled(article.coverImageUrl);

    const healthy =
      categoryActive &&
      hasAtLeastOneProduct &&
      allProductsHaveValidOffer &&
      slugUnique &&
      metaDescriptionFilled &&
      coverImagePresent;

    return {
      ok: true,
      health: {
        categoryActive,
        hasAtLeastOneProduct,
        allProductsHaveValidOffer,
        invalidProducts,
        slugUnique,
        metaDescriptionFilled,
        coverImagePresent,
        healthy,
      },
    };
  }

  /**
   * `categoryId` ausente e `categoryId` apontando para Categoria arquivada
   * (ou inexistente, defensivo) resultam no mesmo `false` — um único item
   * de checklist, decisão explícita desta tarefa (Architecture.md §12 não
   * distingue os dois motivos).
   */
  private async isCategoryActive(siteId: string, categoryId: string | null): Promise<boolean> {
    if (!categoryId) {
      return false;
    }

    const category = await this.categoryRepository.findOneBySite(siteId, categoryId);
    return category !== null && category.archivedAt === null;
  }

  /**
   * `NO_OFFERS` (nenhuma linha de Oferta para o Produto) vs
   * `NO_VALID_OFFER` (linhas existem, mas nenhuma atende simultaneamente a
   * arquivada = não, em estoque = sim, URL HTTP(S) válida) — reaproveita
   * `affiliateUrlSchema` de `@commerce-platform/contracts` para a checagem
   * de URL, mesma regra usada na criação da Oferta (CAT-015), em vez de
   * reimplementar validação de URL aqui.
   *
   * Ordem de `invalidProducts` segue a ordem de `productIds` recebida, já
   * ordenada por `ArticleProduct.position` (vinda de
   * `findProductIdsByArticle`).
   */
  private async findInvalidProducts(
    siteId: string,
    productIds: string[],
  ): Promise<InvalidProduct[]> {
    if (productIds.length === 0) {
      return [];
    }

    const offers = await this.offerRepository.findSummaryByProductIds(siteId, productIds);
    const offersByProduct = groupByProductId(offers);

    const invalidProducts: InvalidProduct[] = [];
    for (const productId of productIds) {
      const productOffers = offersByProduct.get(productId) ?? [];

      if (productOffers.length === 0) {
        invalidProducts.push({ productId, reason: 'NO_OFFERS' });
        continue;
      }

      if (!productOffers.some(isValidOffer)) {
        invalidProducts.push({ productId, reason: 'NO_VALID_OFFER' });
      }
    }

    return invalidProducts;
  }
}

function groupByProductId(offers: OfferSummaryRow[]): Map<string, OfferSummaryRow[]> {
  const map = new Map<string, OfferSummaryRow[]>();

  for (const offer of offers) {
    const existing = map.get(offer.productId);
    if (existing) {
      existing.push(offer);
    } else {
      map.set(offer.productId, [offer]);
    }
  }

  return map;
}

function isValidOffer(offer: OfferSummaryRow): boolean {
  return (
    offer.archivedAt === null &&
    offer.inStock &&
    affiliateUrlSchema.safeParse(offer.affiliateUrl).success
  );
}

function isFilled(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
