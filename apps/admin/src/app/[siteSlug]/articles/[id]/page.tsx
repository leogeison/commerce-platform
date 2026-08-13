import type { Metadata } from 'next';
import { ArticleDetail } from './article-detail';

interface ArticleDetailPageProps {
  params: Promise<{ siteSlug: string; id: string }>;
}

export const metadata: Metadata = {
  title: 'Artigo — Commerce Platform Admin',
};

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { siteSlug, id } = await params;

  return <ArticleDetail siteSlug={siteSlug} id={id} />;
}
