import type { Metadata } from 'next';
import { AuthorDetail } from './author-detail';

interface AuthorDetailPageProps {
  params: Promise<{ siteSlug: string; id: string }>;
}

export const metadata: Metadata = {
  title: 'Autor — Commerce Platform Admin',
};

export default async function AuthorDetailPage({ params }: AuthorDetailPageProps) {
  const { siteSlug, id } = await params;

  return <AuthorDetail siteSlug={siteSlug} id={id} />;
}
