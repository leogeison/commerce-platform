import type { Metadata } from 'next';
import { CategoryDetail } from './category-detail';

interface CategoryDetailPageProps {
  params: Promise<{ siteSlug: string; id: string }>;
}

export const metadata: Metadata = {
  title: 'Categoria — Commerce Platform Admin',
};

export default async function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const { siteSlug, id } = await params;

  return <CategoryDetail siteSlug={siteSlug} id={id} />;
}
