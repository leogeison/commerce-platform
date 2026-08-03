import type { ArticleAdmin, ArticleSummaryAdmin } from '@commerce-platform/contracts';
import type { Article } from '../../../generated/prisma/client';

/**
 * Converte um `Article` (Prisma) para o formato HTTP `ArticleAdmin`
 * (CTR-007). Conversão de `Date` → string ISO na apresentação, mesmo
 * critério de `toCategoryAdmin`/`toProductAdmin` — `publishedAt` nulável
 * segue o mesmo padrão de `archivedAt`.
 */
export function toArticleAdmin(article: Article): ArticleAdmin {
  return {
    id: article.id,
    siteId: article.siteId,
    categoryId: article.categoryId,
    authorId: article.authorId,
    type: article.type,
    status: article.status,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    coverImageUrl: article.coverImageUrl,
    bodyMdx: article.bodyMdx,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

/**
 * Converte um `Article` (Prisma) para o formato HTTP resumido
 * `ArticleSummaryAdmin` (CTR-007, `article-summary.ts`) — usado só pela
 * listagem (`EDT-007`). Mesmos campos de `toArticleAdmin`, exceto
 * `bodyMdx` (decisão explícita da CTR-007: listagem nunca traz o corpo do
 * Artigo).
 */
export function toArticleSummaryAdmin(article: Article): ArticleSummaryAdmin {
  return {
    id: article.id,
    siteId: article.siteId,
    categoryId: article.categoryId,
    authorId: article.authorId,
    type: article.type,
    status: article.status,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    coverImageUrl: article.coverImageUrl,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}
