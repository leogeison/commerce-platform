import type { Metadata } from 'next';
import { ProductDetail } from './product-detail';

interface ProductDetailPageProps {
  params: Promise<{ siteSlug: string; id: string }>;
}

export const metadata: Metadata = {
  title: 'Produto — Commerce Platform Admin',
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { siteSlug, id } = await params;

  return <ProductDetail siteSlug={siteSlug} id={id} />;
}
