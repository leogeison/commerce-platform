import type { PublicArticleSummary } from '@commerce-platform/contracts';
import type { PublishedArticleWithCategorySlug } from '../infrastructure/prisma-article.repository';

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
