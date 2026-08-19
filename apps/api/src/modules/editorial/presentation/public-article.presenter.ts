import type {
  PublicArticle,
  PublicArticleAuthor,
  PublicArticleProduct,
  PublicArticleSummary,
  PublicOffer,
} from '@commerce-platform/contracts';
import type {
  PublishedArticleProductWithOffers,
  PublishedArticleWithCategorySlug,
  PublishedArticleWithProducts,
} from '../infrastructure/prisma-article.repository';
import type { Offer } from '../../../generated/prisma/client';

/**
 * Converte um Artigo publicado (Prisma, já com `category` incluída) para o
 * formato HTTP público `PublicArticleSummary` (PUB-001/CTR-010, PUB-002).
 *
 * `article.category!.slug` e `article.publishedAt!.toISOString()`: sem
 * fallback para nenhum dos dois — Architecture.md §33 garante que
 * `categoryId` é obrigatório no momento da publicação, e
 * `markAsPublished` (EDT-014) sempre grava `publishedAt` na mesma
 * transição que define `status: 'PUBLISHED'`. Um Artigo `PUBLISHED` sem
 * `category` ou sem `publishedAt` seria uma inconsistência real de dados
 * (bug em outro lugar, não algo para este presenter mascarar) — por isso
 * `!`, não `?? null`/`?? ''`.
 */
export function toPublicArticleSummary(
  article: PublishedArticleWithCategorySlug,
): PublicArticleSummary {
  return {
    id: article.id,
    categorySlug: article.category!.slug,
    type: article.type,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    coverImageUrl: article.coverImageUrl,
    publishedAt: article.publishedAt!.toISOString(),
  };
}

/**
 * Converte uma `Offer` (Prisma) para o formato HTTP público `PublicOffer`
 * (PUB-001/CTR-010, PUB-003). `price.toFixed(2)`, nunca `number` — mesmo
 * critério de `offer.presenter.ts`/`product.presenter.ts` (evita perda de
 * precisão em valor monetário; o banco é `Decimal(10,2)`, então a saída
 * sempre tem exatamente duas casas decimais). Sem `affiliateUrl`/
 * `archivedAt` — decisão explícita da PUB-001/PUB-003 (ver
 * `public-offer.ts`): a filtragem de Ofertas arquivadas já aconteceu na
 * consulta (`findOnePublishedBySite`), nunca aqui.
 */
function toPublicOffer(offer: Offer): PublicOffer {
  return {
    id: offer.id,
    marketplace: offer.marketplace,
    price: offer.price.toFixed(2),
    currency: offer.currency,
    inStock: offer.inStock,
  };
}

/**
 * Converte uma linha de `ArticleProduct` (com `product`/`product.offers` já
 * carregados) para o formato HTTP público `PublicArticleProduct` (PUB-003).
 *
 * Produto arquivado não é filtrado aqui nem em nenhuma camada anterior —
 * decisão explícita da PUB-003: continua aparecendo em `products[]` mesmo
 * arquivado (Architecture.md §12), com `offers: []` se todas as suas
 * Ofertas estiverem arquivadas (já filtradas na consulta).
 */
function toPublicArticleProduct(
  articleProduct: PublishedArticleProductWithOffers,
): PublicArticleProduct {
  return {
    id: articleProduct.product.id,
    name: articleProduct.product.name,
    description: articleProduct.product.description,
    imageUrl: articleProduct.product.imageUrl,
    position: articleProduct.position,
    offers: articleProduct.product.offers.map(toPublicOffer),
  };
}

/**
 * Converte o Autor vinculado (já selecionado só com `name`/`avatarUrl` na
 * própria consulta, `findOnePublishedBySite` — `select`, nunca `include:
 * true`) para o formato público `PublicArticleAuthor` (UXF-011). `null`
 * quando o Artigo não tem Autor vinculado (`Article.authorId` é opcional)
 * — nunca lançado como erro, mesmo critério do restante da API pública
 * para dado ausente e não obrigatório.
 */
function toPublicArticleAuthor(
  author: { name: string; avatarUrl: string | null } | null,
): PublicArticleAuthor | null {
  if (!author) {
    return null;
  }

  return {
    name: author.name,
    avatarUrl: author.avatarUrl,
  };
}

/**
 * Converte um Artigo publicado (com `category`/`products`/`author` já
 * carregados) para o formato HTTP público `PublicArticle` (PUB-003) —
 * corpo completo de `GET /public/sites/:siteSlug/articles/:slug`.
 *
 * Reaproveita `toPublicArticleSummary` (mesmos campos, mesmas invariantes
 * de `category`/`publishedAt` sem fallback) e acrescenta `bodyMdx` (só faz
 * sentido no detalhe), `products` (mapeados por `toPublicArticleProduct`,
 * já na ordem de `position asc` devolvida pelo repository) e `author`
 * (UXF-011, mapeado por `toPublicArticleAuthor`).
 */
export function toPublicArticle(article: PublishedArticleWithProducts): PublicArticle {
  return {
    ...toPublicArticleSummary(article),
    bodyMdx: article.bodyMdx,
    products: article.products.map(toPublicArticleProduct),
    author: toPublicArticleAuthor(article.author),
  };
}
