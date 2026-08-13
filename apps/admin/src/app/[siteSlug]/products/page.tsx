import type { Metadata } from 'next';
import { ProductList } from './product-list';

interface ProductsPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Produtos — Commerce Platform Admin',
};

/**
 * `/:siteSlug/products` (ADM-006; Architecture.md §32). Server Component
 * fino — só resolve `params` e repassa `siteSlug`. Toda a lógica fica em
 * `ProductList` (`"use client"`).
 */
export default async function ProductsPage({ params }: ProductsPageProps) {
  const { siteSlug } = await params;

  return <ProductList siteSlug={siteSlug} />;
}
