import type { Metadata } from 'next';
import { CreateArticle } from './create-article';

interface NewArticlePageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Novo Artigo — Commerce Platform Admin',
};

export default async function NewArticlePage({ params }: NewArticlePageProps) {
  const { siteSlug } = await params;

  return <CreateArticle siteSlug={siteSlug} />;
}
