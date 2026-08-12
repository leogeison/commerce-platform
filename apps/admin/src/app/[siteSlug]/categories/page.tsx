import type { Metadata } from 'next';
import { CategoryList } from './category-list';

interface CategoriesPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Categorias — Commerce Platform Admin',
};

/**
 * `/:siteSlug/categories` (ADM-005; Architecture.md §32). Server Component
 * fino — só resolve `params` e repassa `siteSlug`. Toda a lógica fica em
 * `CategoryList` (`"use client"`), mesma fronteira estreita já usada nas
 * demais páginas do Admin.
 */
export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { siteSlug } = await params;

  return <CategoryList siteSlug={siteSlug} />;
}
