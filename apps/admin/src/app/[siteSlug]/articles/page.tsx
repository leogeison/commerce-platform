import type { Metadata } from 'next';
import { ArticleList } from './article-list';

interface ArticlesPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Artigos — Commerce Platform Admin',
};

/**
 * `/:siteSlug/articles` (ADM-008; Architecture.md §32). Server Component
 * fino — só resolve `params` e repassa `siteSlug`. Toda a lógica fica em
 * `ArticleList` (`"use client"`). Sem `/new`, sem `/:id` — isso é ADM-009+.
 */
export default async function ArticlesPage({ params }: ArticlesPageProps) {
  const { siteSlug } = await params;

  return <ArticleList siteSlug={siteSlug} />;
}
