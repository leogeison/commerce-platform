import type { Metadata } from 'next';
import { CreateProduct } from './create-product';

interface NewProductPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Novo Produto — Commerce Platform Admin',
};

export default async function NewProductPage({ params }: NewProductPageProps) {
  const { siteSlug } = await params;

  return <CreateProduct siteSlug={siteSlug} />;
}
