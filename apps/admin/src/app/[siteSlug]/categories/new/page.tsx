import type { Metadata } from 'next';
import { CreateCategory } from './create-category';

interface NewCategoryPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Nova Categoria — Commerce Platform Admin',
};

export default async function NewCategoryPage({ params }: NewCategoryPageProps) {
  const { siteSlug } = await params;

  return <CreateCategory siteSlug={siteSlug} />;
}
